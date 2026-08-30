import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  RotateCcw, FileSpreadsheet, Calendar, ClipboardList, Eye, ShieldCheck, History
} from "lucide-react";

type Step = "upload" | "preview" | "commit" | "done";
type ImportType = "schedule" | "attendance";

interface BatchInfo {
  batchId: string;
  importType: ImportType;
  moduleType: string;
  totalRows: number;
  fileName: string;
  sampleRows: any[];
  hasErrors: boolean;
}

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: "upload", label: "Upload File", icon: Upload },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "commit", label: "Approve & Import", icon: ShieldCheck },
  { id: "done", label: "Results", icon: CheckCircle2 },
];

function ScheduleRowTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No rows to preview.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            {["Employee", "Date", "Start", "End", "Hours", "Position", "Location", "Issues"].map(h => (
              <th key={h} className="text-left py-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              <td className="py-1.5 pr-3 font-medium">{row.employeeName || "—"}</td>
              <td className="py-1.5 pr-3">{row.shiftDate || "—"}</td>
              <td className="py-1.5 pr-3">{row.startTime || "—"}</td>
              <td className="py-1.5 pr-3">{row.endTime || "—"}</td>
              <td className="py-1.5 pr-3">{row.scheduledHours ?? "—"}</td>
              <td className="py-1.5 pr-3">{row.position || "—"}</td>
              <td className="py-1.5 pr-3">{row.locationName || "—"}</td>
              <td className="py-1.5 text-destructive text-xs">{row.validationErrors?.join(", ") || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceRowTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No rows to preview.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            {["Employee", "Date", "Type", "Actual Start", "Actual End", "Hours", "Location", "Issues"].map(h => (
              <th key={h} className="text-left py-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              <td className="py-1.5 pr-3 font-medium">{row.employeeName || "—"}</td>
              <td className="py-1.5 pr-3">{row.noticeDate || "—"}</td>
              <td className="py-1.5 pr-3">{row.noticeType || "—"}</td>
              <td className="py-1.5 pr-3">{row.actualStart || "—"}</td>
              <td className="py-1.5 pr-3">{row.actualEnd || "—"}</td>
              <td className="py-1.5 pr-3">{row.actualHours ?? "—"}</td>
              <td className="py-1.5 pr-3">{row.locationName || "—"}</td>
              <td className="py-1.5 text-destructive text-xs">{row.validationErrors?.join(", ") || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportWizard({ importType }: { importType: ImportType }) {
  const [step, setStep] = useState<Step>("upload");
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [commitFile, setCommitFile] = useState<File | null>(null);
  const [commitPhrase, setCommitPhrase] = useState("");
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [rollbackResult, setRollbackResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commitFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isProduction = window.location.hostname.includes("replit.app") || import.meta.env.MODE === "production";

  const { data: batches = [], refetch: refetchBatches } = useQuery<any[]>({
    queryKey: ["/api/wiw-import/batches", importType],
    queryFn: async () => {
      const res = await fetch(`/api/wiw-import/batches?type=${importType}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/wiw-import/upload/${importType}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBatch(data);
      setStep("preview");
      toast({ title: "File uploaded", description: `${data.totalRows} rows detected.` });
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!batch || !commitFile) throw new Error("File required");
      const formData = new FormData();
      formData.append("file", commitFile);
      formData.append("productionConfirmPhrase", isProduction ? commitPhrase : "IMPORT INTO PRODUCTION");
      formData.append("validationConfirmed", isProduction ? String(validationConfirmed) : "true");
      const res = await fetch(`/api/wiw-import/${batch.batchId}/commit-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep("done");
      refetchBatches();
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling"] });
      toast({ title: "Import complete" });
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/wiw-import/${batch!.batchId}/rollback`, {}),
    onSuccess: (data: any) => {
      setRollbackResult(data);
      refetchBatches();
      toast({ title: "Rollback complete", description: `${data.deleted} records deleted.` });
    },
    onError: (err: any) => toast({ title: "Rollback failed", description: err.message, variant: "destructive" }),
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const reset = () => {
    setStep("upload");
    setBatch(null);
    setCommitFile(null);
    setCommitPhrase("");
    setValidationConfirmed(false);
    setCommitResult(null);
    setRollbackResult(null);
  };

  const Icon = importType === "schedule" ? Calendar : ClipboardList;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = s.id === step;
          const isDone = i < currentStepIndex;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-muted text-muted-foreground" : "text-muted-foreground"
              }`}>
                <StepIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload {importType === "schedule" ? "Schedule" : "Attendance"} File</CardTitle>
            <CardDescription>
              {importType === "schedule"
                ? "Upload the WhenIWork schedule export (XLSX or CSV). The format must match WIW's standard schedule export."
                : "Upload the WhenIWork attendance/timecard export (CSV). The format must match WIW's standard attendance export."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-md p-12 text-center cursor-pointer hover-elevate transition-colors flex flex-col items-center gap-3"
              data-testid={`dropzone-wiw-${importType}`}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Drop WIW {importType === "schedule" ? "schedule" : "attendance"} export here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">{importType === "schedule" ? "XLSX, XLS, CSV" : "CSV"} accepted · Max 50MB</p>
              </div>
              {uploadMutation.isPending && <p className="text-sm text-primary animate-pulse">Uploading...</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={importType === "schedule" ? ".xlsx,.xls,.csv" : ".csv"}
              className="hidden"
              onChange={handleFileSelect}
              data-testid={`input-wiw-${importType}-file`}
            />

            {batches.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Recent Imports
                </p>
                <div className="flex flex-col gap-1.5">
                  {batches.slice(0, 5).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">{b.sourceFileName}</span>
                        <span className="text-muted-foreground">{b.totalRows} rows</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={b.status === "committed" ? "default" : b.status === "rolled_back" ? "secondary" : "outline"}>
                          {b.status}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{new Date(b.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "preview" && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Preview (first 10 rows)</CardTitle>
            <CardDescription>
              {batch.totalRows} total rows in {batch.fileName}. Review the parsed data before committing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {batch.hasErrors && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>Some rows have validation errors and will be skipped during import.</AlertDescription>
              </Alert>
            )}

            {importType === "schedule"
              ? <ScheduleRowTable rows={batch.sampleRows} />
              : <AttendanceRowTable rows={batch.sampleRows} />}

            <div className="flex justify-between gap-3 mt-2">
              <Button variant="outline" onClick={reset} data-testid="button-wiw-back-upload">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("commit")} data-testid="button-wiw-proceed-commit">
                Proceed to Import <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "commit" && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Approve & Import</CardTitle>
            <CardDescription>
              Re-upload the same file to confirm and process all {batch.totalRows} rows.
              {isProduction && " This is a PRODUCTION environment."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <ShieldCheck className="w-4 h-4" />
              <AlertDescription>
                A 24-hour rollback window is available after import.
                {importType === "schedule"
                  ? " Rollback deletes all shifts (and cascade-deletes shift assignments) created by this import."
                  : " Rollback deletes all time punches created by this import."}
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Label>Re-upload the same file to confirm import</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => commitFileInputRef.current?.click()} data-testid="button-commit-file-browse">
                  <Upload className="w-3.5 h-3.5 mr-1" /> Browse File
                </Button>
                {commitFile && (
                  <span className="text-sm text-muted-foreground">{commitFile.name}</span>
                )}
              </div>
              <input
                ref={commitFileInputRef}
                type="file"
                accept={importType === "schedule" ? ".xlsx,.xls,.csv" : ".csv"}
                className="hidden"
                onChange={e => setCommitFile(e.target.files?.[0] || null)}
                data-testid={`input-wiw-${importType}-commit-file`}
              />
            </div>

            {isProduction && (
              <div className="flex flex-col gap-3 border rounded-md p-4 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Production Confirmation Required</p>
                <div className="flex flex-col gap-1.5">
                  <Label>Type exactly: <code className="bg-muted px-1 rounded text-xs">IMPORT INTO PRODUCTION</code></Label>
                  <Input
                    value={commitPhrase}
                    onChange={e => setCommitPhrase(e.target.value)}
                    placeholder="IMPORT INTO PRODUCTION"
                    data-testid="input-wiw-confirm-phrase"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="wiw-val-confirm"
                    checked={validationConfirmed}
                    onChange={e => setValidationConfirmed(e.target.checked)}
                    data-testid="checkbox-wiw-validation-confirmed"
                  />
                  <label htmlFor="wiw-val-confirm" className="text-sm">I have reviewed the preview and confirm the data is correct.</label>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep("preview")} data-testid="button-wiw-back-preview">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => commitMutation.mutate()}
                disabled={
                  !commitFile ||
                  commitMutation.isPending ||
                  (isProduction && (commitPhrase !== "IMPORT INTO PRODUCTION" || !validationConfirmed))
                }
                data-testid="button-wiw-confirm-import"
              >
                {commitMutation.isPending ? "Importing..." : `Import ${batch.totalRows} Rows`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && commitResult && batch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {importType === "schedule" ? [
                { label: "Shifts Created", value: commitResult.shiftsCreated ?? 0, color: "text-green-600" },
                { label: "Skipped (Dup)", value: commitResult.shiftsSkipped ?? commitResult.skippedDuplicates ?? 0, color: "text-muted-foreground" },
                { label: "Assignments", value: commitResult.assignmentsCreated ?? 0, color: "text-blue-600" },
              ] : [
                { label: "Punches Created", value: commitResult.punchesCreated ?? 0, color: "text-green-600" },
                { label: "Skipped (Dup)", value: commitResult.punchesDeduplicated ?? 0, color: "text-muted-foreground" },
                { label: "Skipped (No Data)", value: commitResult.punchesSkippedNoPunchData ?? 0, color: "text-amber-600" },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center bg-muted/40 rounded-md py-3">
                  <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 text-center">{stat.label}</span>
                </div>
              ))}
            </div>

            {!rollbackResult && (
              <div className="border rounded-md p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">24-Hour Rollback Available</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {importType === "schedule"
                    ? "Rollback deletes all shifts and their assignments created by this import run."
                    : "Rollback deletes all time punches created by this import run."}
                </p>
                <Button
                  variant="outline"
                  onClick={() => rollbackMutation.mutate()}
                  disabled={rollbackMutation.isPending}
                  className="self-start"
                  data-testid="button-wiw-rollback"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  {rollbackMutation.isPending ? "Rolling back..." : "Rollback This Import"}
                </Button>
              </div>
            )}

            {rollbackResult && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription>
                  Rollback complete. {rollbackResult.deleted} records deleted.
                </AlertDescription>
              </Alert>
            )}

            <Button variant="outline" onClick={reset} className="self-start" data-testid="button-wiw-new-import">
              Start New Import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function WiwImportWizard() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">WhenIWork Import Wizard</h1>
          <Badge variant="secondary">Super Admin Only</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Import WhenIWork schedule and attendance exports with preview validation and 24-hour rollback support.
        </p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule" data-testid="tab-wiw-schedule">
            <Calendar className="w-3.5 h-3.5 mr-1.5" /> Schedule Import
          </TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-wiw-attendance">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Attendance Import
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <ImportWizard importType="schedule" />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <ImportWizard importType="attendance" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
