import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Upload, FileSpreadsheet, Clock, Loader2,
  CheckCircle2, XCircle, AlertCircle, ArrowLeft
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function validateFile(file: File, allowedExts: string[]): string | null {
  if (file.size > MAX_FILE_SIZE) return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 25MB.`;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !allowedExts.includes(ext)) return `Invalid file type. Allowed: ${allowedExts.join(', ')}`;
  return null;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "failed": return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "processing": return <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />;
    case "partial": return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusBadgeVariant(status: string) {
  const map: Record<string, string> = {
    completed: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
    processing: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
    failed: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
    partial: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
    pending: "bg-muted text-muted-foreground",
    queued: "bg-muted text-muted-foreground",
  };
  return map[status] || map.pending;
}

export default function WiwImports() {
  const { toast } = useToast();
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const attendanceFileRef = useRef<HTMLInputElement>(null);

  const scheduleMutation = useMutation({
    mutationFn: async (file: File) => {
      const error = validateFile(file, ['xlsx', 'xls']);
      if (error) throw new Error(error);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/scheduling/wiw/import/schedule", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Schedule imported", description: `${data.totalRows} rows processed. ${data.matched} matched, ${data.unmatched} unmatched.` });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/import-runs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async (file: File) => {
      const error = validateFile(file, ['csv', 'xlsx', 'xls']);
      if (error) throw new Error(error);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/scheduling/wiw/import/attendance", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Attendance imported", description: `${data.totalRows} rows processed. ${data.matched} matched, ${data.unmatched} unmatched.` });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/import-runs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/wiw/import-runs"],
  });

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { data: runDetail } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/import-runs", expandedRunId],
    enabled: !!expandedRunId,
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/scheduling">
          <Button variant="ghost" size="icon" data-testid="button-back-scheduling">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">When I Work Import Center</h1>
          <p className="text-sm text-muted-foreground">Upload schedule and attendance files from When I Work</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-upload-schedule">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Schedule Import
            </CardTitle>
            <CardDescription>Upload a When I Work schedule export (.xlsx) to import shift data</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={scheduleFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              data-testid="input-schedule-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) scheduleMutation.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => scheduleFileRef.current?.click()}
              disabled={scheduleMutation.isPending}
              className="w-full"
              data-testid="button-upload-schedule"
            >
              {scheduleMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Upload Schedule XLSX</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-upload-attendance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Attendance Notices
            </CardTitle>
            <CardDescription>Upload attendance notice exports (.csv, .xlsx) with late/missed punch data</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={attendanceFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              data-testid="input-attendance-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attendanceMutation.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => attendanceFileRef.current?.click()}
              disabled={attendanceMutation.isPending}
              className="w-full"
              data-testid="button-upload-attendance"
            >
              {attendanceMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Upload Attendance CSV</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-upload-history">
        <CardHeader>
          <CardTitle>Upload History</CardTitle>
          <CardDescription>All import attempts with their status and results</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-imports">
              No imports yet. Upload a schedule or attendance file above to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-upload-history">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">File</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Uploaded</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-2 font-medium text-muted-foreground">Rows</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run: any) => {
                    const errorMsg = run.errorLog && Array.isArray(run.errorLog) && run.errorLog.length > 0
                      ? run.errorLog[0]?.error || JSON.stringify(run.errorLog[0])
                      : null;
                    return (
                      <tr
                        key={run.id}
                        className="border-b border-muted cursor-pointer hover-elevate"
                        onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                        data-testid={`row-import-${run.id}`}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {run.importType === "schedule" ? (
                              <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate max-w-[200px]" data-testid={`text-filename-${run.id}`}>{run.fileName}</span>
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge className="bg-muted text-muted-foreground" data-testid={`badge-type-${run.id}`}>
                            {run.importType}
                          </Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground" data-testid={`text-uploaded-${run.id}`}>
                          {format(new Date(run.createdAt), "MMM d, yyyy h:mm a")}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            {statusIcon(run.status)}
                            <Badge className={statusBadgeVariant(run.status)} data-testid={`badge-status-${run.id}`}>
                              {run.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums" data-testid={`text-rows-${run.id}`}>
                          {run.totalRows ?? 0}
                        </td>
                        <td className="p-2">
                          {errorMsg ? (
                            <span className="text-red-600 dark:text-red-400 text-xs truncate max-w-[200px] block" data-testid={`text-error-${run.id}`}>
                              {errorMsg}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
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

      {expandedRunId && runDetail && (
        <Card data-testid="card-import-detail">
          <CardHeader>
            <CardTitle className="text-base">Import Detail: {runDetail.fileName}</CardTitle>
            <CardDescription>
              {runDetail.processedRows} processed · {runDetail.matchedEmployees} matched · {runDetail.unmatchedEmployees} unmatched
              {runDetail.dateRangeStart && ` · ${runDetail.dateRangeStart} to ${runDetail.dateRangeEnd}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {runDetail.scheduleRows?.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">Schedule Rows (first 50)</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Hours</th>
                      <th className="text-left p-2 font-medium">Position</th>
                      <th className="text-left p-2 font-medium">Location</th>
                      <th className="text-left p-2 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetail.scheduleRows.slice(0, 50).map((row: any) => (
                      <tr key={row.id} className="border-b border-muted">
                        <td className="p-2">{row.employeeName || "—"}</td>
                        <td className="p-2">{row.shiftDate || "—"}</td>
                        <td className="p-2 tabular-nums">{row.scheduledHours || "—"}</td>
                        <td className="p-2">{row.position || "—"}</td>
                        <td className="p-2">{row.locationName || "—"}</td>
                        <td className="p-2">
                          <Badge className={row.matchStatus === "matched" ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" : "bg-muted text-muted-foreground"}>
                            {row.matchStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {runDetail.attendanceRows?.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <p className="text-sm font-medium mb-2">Attendance Rows (first 50)</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Location</th>
                      <th className="text-left p-2 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetail.attendanceRows.slice(0, 50).map((row: any) => (
                      <tr key={row.id} className="border-b border-muted">
                        <td className="p-2">{row.employeeName || "—"}</td>
                        <td className="p-2">{row.noticeDate || "—"}</td>
                        <td className="p-2">{row.noticeType || "—"}</td>
                        <td className="p-2">{row.locationName || "—"}</td>
                        <td className="p-2">
                          <Badge className={row.matchStatus === "matched" ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" : "bg-muted text-muted-foreground"}>
                            {row.matchStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
