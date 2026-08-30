import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  RotateCcw, FileSpreadsheet, Users, Eye, ShieldCheck, History, X
} from "lucide-react";

type Step = "upload" | "map" | "preview" | "commit" | "done";

interface BatchInfo {
  batchId: string;
  totalRows: number;
  headers: string[];
  autoMapping: Record<string, string>;
  fileName: string;
}

interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: string;
  required: boolean;
  aliases: string[];
}

interface PreviewRow {
  rowIndex: number;
  raw: Record<string, any>;
  mapped: Record<string, any>;
  errors: string[];
  action: string;
  matchInfo?: string;
}

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: "upload", label: "Upload File", icon: Upload },
  { id: "map", label: "Map Columns", icon: FileSpreadsheet },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "commit", label: "Approve & Import", icon: ShieldCheck },
  { id: "done", label: "Results", icon: CheckCircle2 },
];

export default function RecruitingImport() {
  const [step, setStep] = useState<Step>("upload");
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [rollbackResult, setRollbackResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isProduction = window.location.hostname.includes("replit.app") || import.meta.env.MODE === "production";

  const { data: fieldCatalog = [] } = useQuery<FieldDef[]>({
    queryKey: ["/api/recruiting-import/field-catalog"],
  });

  const { data: batches = [], refetch: refetchBatches } = useQuery<any[]>({
    queryKey: ["/api/recruiting-import/batches"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/recruiting-import/upload", {
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
      setMapping(data.autoMapping || {});
      setStep("map");
      toast({ title: "File uploaded", description: `${data.totalRows} rows ready for mapping.` });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const mapMutation = useMutation({
    mutationFn: (columnMapping: Record<string, string>) =>
      apiRequest("POST", `/api/recruiting-import/${batch!.batchId}/map`, { columnMapping }),
    onSuccess: () => setStep("preview"),
    onError: (err: any) => toast({ title: "Save mapping failed", description: err.message, variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting-import/${batch!.batchId}/preview`, {}),
    onSuccess: (data: any) => {
      setPreviews(data.previews || []);
      setStep("preview");
    },
    onError: (err: any) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting-import/${batch!.batchId}/commit`, {
        duplicateAction,
        productionConfirmPhrase: isProduction ? confirmPhrase : "IMPORT INTO PRODUCTION",
        validationConfirmed: isProduction ? validationConfirmed : true,
      }),
    onSuccess: (data: any) => {
      setCommitResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      refetchBatches();
      toast({ title: "Import complete", description: `${data.created} candidates created.` });
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting-import/${batch!.batchId}/rollback`, {}),
    onSuccess: (data: any) => {
      setRollbackResult(data);
      refetchBatches();
      toast({ title: "Rollback complete", description: `${data.archived} candidates archived.` });
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

  const groupedFields = fieldCatalog.reduce((acc: Record<string, FieldDef[]>, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  const requiredMapped = fieldCatalog.filter(f => f.required).every(f => Object.values(mapping).includes(f.key));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Recruiting Candidate Import</h1>
          <Badge variant="secondary">Super Admin Only</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Bulk import candidates from CSV or XLSX. Includes column mapping, 10-row preview, and 24-hour rollback.
        </p>
      </div>

      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = i < currentStepIndex;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-muted text-muted-foreground" : "text-muted-foreground"
              }`}>
                <Icon className="w-3.5 h-3.5" />
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
            <CardTitle>Upload Candidate File</CardTitle>
            <CardDescription>CSV or XLSX files up to 25MB. First row must be column headers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-md p-12 text-center cursor-pointer hover-elevate transition-colors flex flex-col items-center gap-3"
              data-testid="dropzone-recruiting-import"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Drop file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">CSV, XLSX accepted · Max 25MB</p>
              </div>
              {uploadMutation.isPending && <p className="text-sm text-primary animate-pulse">Uploading...</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-recruiting-file"
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

      {step === "map" && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Match your file's {batch.headers.length} columns to candidate fields. Required fields: First Name, Last Name, Email.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!requiredMapped && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>Required fields (First Name, Last Name, Email) must be mapped to continue.</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {batch.headers.map(header => (
                <div key={header} className="flex flex-col gap-1">
                  <Label className="text-xs font-medium text-muted-foreground">{header}</Label>
                  <Select
                    value={mapping[header] || "__none__"}
                    onValueChange={val => setMapping(prev => ({ ...prev, [header]: val === "__none__" ? "" : val }))}
                  >
                    <SelectTrigger data-testid={`select-map-${header}`}>
                      <SelectValue placeholder="Skip this column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip this column —</SelectItem>
                      {Object.entries(groupedFields).map(([group, fields]) => (
                        <div key={group}>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                          {fields.map(f => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-3 mt-2">
              <Button variant="outline" onClick={() => setStep("upload")} data-testid="button-back-upload">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => mapMutation.mutate(mapping)}
                disabled={!requiredMapped || mapMutation.isPending}
                data-testid="button-save-mapping"
              >
                Save & Preview <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && batch && (
        <Card>
          <CardHeader>
            <CardTitle>Preview (10 rows)</CardTitle>
            <CardDescription>Review how your data will be imported. Showing first 10 of {batch.totalRows} rows.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} className="self-start" data-testid="button-run-preview">
              <Eye className="w-3.5 h-3.5 mr-1" /> {previewMutation.isPending ? "Loading..." : "Run Preview"}
            </Button>

            {previews.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Row</th>
                      <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Name</th>
                      <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Email</th>
                      <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Action</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map(row => (
                      <tr key={row.rowIndex} className="border-b hover-elevate">
                        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{row.rowIndex + 1}</td>
                        <td className="py-2 pr-3">{[row.mapped.firstName, row.mapped.lastName].filter(Boolean).join(" ") || <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{row.mapped.email || <span className="text-destructive">—</span>}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={row.action === "create" ? "default" : row.errors.length > 0 ? "destructive" : "secondary"}>
                            {row.action}
                          </Badge>
                          {row.matchInfo && <span className="text-xs text-muted-foreground ml-1">{row.matchInfo}</span>}
                        </td>
                        <td className="py-2 text-xs text-destructive">{row.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-between gap-3 mt-2">
              <Button variant="outline" onClick={() => setStep("map")} data-testid="button-back-map">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setStep("commit")}
                disabled={previews.length === 0 || previews.every(p => p.errors.length > 0)}
                data-testid="button-proceed-commit"
              >
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
              You are about to import up to {batch.totalRows} candidates into the recruiting database.
              {isProduction && " This is a PRODUCTION environment. Type the confirmation phrase to proceed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert>
              <ShieldCheck className="w-4 h-4" />
              <AlertDescription>
                A 24-hour rollback window is available after import. Rollback archives the imported candidates rather than permanently deleting them.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Label>Duplicate handling</Label>
              <Select value={duplicateAction} onValueChange={(v: any) => setDuplicateAction(v)}>
                <SelectTrigger className="w-64" data-testid="select-duplicate-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip duplicates (safe default)</SelectItem>
                  <SelectItem value="update">Update existing records</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Duplicates are detected by matching email address or phone number.</p>
            </div>

            {isProduction && (
              <div className="flex flex-col gap-3 border rounded-md p-4 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Production Confirmation Required</p>
                <div className="flex flex-col gap-1.5">
                  <Label>Type exactly: <code className="bg-muted px-1 rounded text-xs">IMPORT INTO PRODUCTION</code></Label>
                  <Input
                    value={confirmPhrase}
                    onChange={e => setConfirmPhrase(e.target.value)}
                    placeholder="IMPORT INTO PRODUCTION"
                    data-testid="input-confirm-phrase"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="val-confirm"
                    checked={validationConfirmed}
                    onChange={e => setValidationConfirmed(e.target.checked)}
                    data-testid="checkbox-validation-confirmed"
                  />
                  <label htmlFor="val-confirm" className="text-sm">I have reviewed the preview and confirm the data is correct.</label>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep("preview")} data-testid="button-back-preview">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button
                onClick={() => commitMutation.mutate()}
                disabled={
                  commitMutation.isPending ||
                  (isProduction && (confirmPhrase !== "IMPORT INTO PRODUCTION" || !validationConfirmed))
                }
                data-testid="button-confirm-import"
              >
                {commitMutation.isPending ? "Importing..." : `Import ${batch.totalRows} Candidates`}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Created", value: commitResult.created, color: "text-green-600" },
                { label: "Updated", value: commitResult.updated || 0, color: "text-blue-600" },
                { label: "Skipped", value: commitResult.skipped, color: "text-muted-foreground" },
                { label: "Errors", value: commitResult.errored, color: "text-destructive" },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center bg-muted/40 rounded-md py-3">
                  <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">{stat.label}</span>
                </div>
              ))}
            </div>

            {commitResult.errors?.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-destructive">Row Errors (first 50)</p>
                <div className="max-h-32 overflow-y-auto bg-muted/40 rounded-md p-3 text-xs font-mono flex flex-col gap-0.5">
                  {commitResult.errors.map((e: any, i: number) => (
                    <div key={i}>Row {e.row}: {e.error}</div>
                  ))}
                </div>
              </div>
            )}

            {!rollbackResult && (
              <div className="border rounded-md p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">24-Hour Rollback Available</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rolling back will archive the {commitResult.created} newly created candidates. This cannot be undone after 24 hours.
                </p>
                <Button
                  variant="outline"
                  onClick={() => rollbackMutation.mutate()}
                  disabled={rollbackMutation.isPending}
                  className="self-start"
                  data-testid="button-rollback-import"
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
                  Rollback complete. {rollbackResult.archived} candidates have been archived.
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => {
                setStep("upload");
                setBatch(null);
                setMapping({});
                setPreviews([]);
                setCommitResult(null);
                setRollbackResult(null);
                setConfirmPhrase("");
                setValidationConfirmed(false);
              }}
              variant="outline"
              className="self-start"
              data-testid="button-new-import"
            >
              Start New Import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
