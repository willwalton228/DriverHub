import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Upload, ChevronRight, AlertTriangle, RotateCcw, FileSpreadsheet, Users, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface FieldDef { key: string; label: string; group: string; required: boolean; aliases: string[] }
interface PreviewRow {
  rowIndex: number;
  raw: Record<string, any>;
  mapped: Record<string, any>;
  errors: string[];
  action: "create" | "skip" | "error";
  matchInfo: string | null;
}
interface BatchInfo {
  id: string; status: string; totalRows: number; createdRows: number;
  skippedRows: number; failedRows: number; committedAt: string | null;
  rolledBackAt: string | null; sourceFileName: string;
}

const STEPS = ["Upload", "Map Columns", "Preview", "Confirm", "Result"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${
            i < current ? "bg-primary border-primary text-primary-foreground" :
            i === current ? "border-primary text-primary" :
            "border-muted-foreground/30 text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-sm ${i === current ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
          {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

export default function EmployeeImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [totalRows, setTotalRows] = useState(0);
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const isProduction = window.location.hostname.includes("replit.app");

  const { data: fieldCatalog = [] } = useQuery<FieldDef[]>({
    queryKey: ["/api/employee-import/field-catalog"],
  });

  const { data: batches = [], refetch: refetchBatches } = useQuery<BatchInfo[]>({
    queryKey: ["/api/employee-import/batches"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/employee-import/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    onSuccess: (data) => {
      setBatchId(data.batchId);
      setHeaders(data.headers);
      setMapping(data.autoMapping || {});
      setTotalRows(data.totalRows);
      setStep(1);
    },
    onError: (err: any) => {
      toast({ title: "Upload Failed", description: err.message || "Could not parse file", variant: "destructive" });
    },
  });

  const mappingMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/employee-import/${batchId}/mapping`, { mapping });
    },
    onSuccess: () => previewMutation.mutate(),
    onError: () => toast({ title: "Error", description: "Could not save mapping", variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/employee-import/${batchId}/preview`, { credentials: "include" });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    onSuccess: (data) => {
      setPreviews(data.previews);
      setStep(3);
    },
    onError: (err: any) => {
      toast({ title: "Preview Failed", description: err.message, variant: "destructive" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/employee-import/${batchId}/commit`, {
        productionConfirmPhrase: confirmPhrase,
        validationConfirmed,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep(4);
      refetchBatches();
      toast({ title: "Import Complete", description: `${data.created} employees created, ${data.skipped} skipped` });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (bid: string) => {
      const res = await apiRequest("POST", `/api/employee-import/${bid}/rollback`, {});
      return res.json();
    },
    onSuccess: (data) => {
      refetchBatches();
      toast({ title: "Rollback Complete", description: `${data.archived} employees archived` });
    },
    onError: (err: any) => {
      toast({ title: "Rollback Failed", description: err.message, variant: "destructive" });
    },
  });

  const groups = [...new Set(fieldCatalog.map(f => f.group))];

  function reset() {
    setStep(0); setBatchId(null); setHeaders([]); setMapping({});
    setTotalRows(0); setPreviews([]); setCommitResult(null);
    setConfirmPhrase(""); setValidationConfirmed(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/employees">
          <Button variant="ghost" size="icon" data-testid="button-back-employees"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Employee Import Wizard</h1>
            <p className="text-sm text-muted-foreground">Super Admin only — bulk load employees from CSV or XLSX</p>
          </div>
        </div>
      </div>

      <StepIndicator current={step} />

      {/* Step 0: Upload */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>CSV or XLSX with employee data. First row must be column headers. Dedup by email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed rounded-md p-10 text-center cursor-pointer hover-elevate"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Click to select CSV or XLSX</p>
              <p className="text-xs text-muted-foreground mt-1">Max 25 MB · Required: First Name, Last Name, Email</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              data-testid="input-file-upload"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); }}
            />
            {uploadMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Parsing file…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Map columns */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              {totalRows} rows detected. Match your spreadsheet columns to employee fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {groups.map(group => (
              <div key={group}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fieldCatalog.filter(f => f.group === group).map(field => (
                    <div key={field.key} className="flex items-center gap-3">
                      <div className="w-44 shrink-0">
                        <p className="text-sm font-medium">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </p>
                      </div>
                      <Select
                        value={mapping[field.key] || "__none__"}
                        onValueChange={v => setMapping(prev => ({ ...prev, [field.key]: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-map-${field.key}`}>
                          <SelectValue placeholder="— skip —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— skip —</SelectItem>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={reset}>Start Over</Button>
              <Button
                onClick={() => mappingMutation.mutate()}
                disabled={mappingMutation.isPending || previewMutation.isPending}
                data-testid="button-save-mapping"
              >
                {(mappingMutation.isPending || previewMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Preview Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview table */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview — first 10 rows</CardTitle>
            <CardDescription>Showing sample of {totalRows} total rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previews.some(p => p.errors.length > 0) && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>Some rows have validation errors and will be skipped.</AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Row</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Email</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Title / Dept</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Hire Date</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map(p => (
                    <tr key={p.rowIndex} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{p.rowIndex + 1}</td>
                      <td className="py-2 pr-4 font-medium">
                        {[p.mapped.firstName, p.mapped.lastName].filter(Boolean).join(" ") || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.mapped.email || "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {[p.mapped.title, p.mapped.department].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.mapped.hireDate || "—"}</td>
                      <td className="py-2">
                        {p.action === "error" ? (
                          <Badge variant="destructive">Error: {p.errors[0]}</Badge>
                        ) : p.action === "skip" ? (
                          <Badge variant="secondary">Skip — {p.matchInfo}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-700 border-green-300">Create</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back to Mapping</Button>
              <Button onClick={() => setStep(3.5 as any)} data-testid="button-proceed-commit">
                Proceed to Import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm gate */}
      {(step as any) === 3.5 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Import</CardTitle>
            <CardDescription>
              You are about to create up to <strong>{totalRows}</strong> employee records.
              Existing employees (matched by email) will be skipped.
              {isProduction && " This is a PRODUCTION environment."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProduction && (
              <>
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    Production import. Type <strong>IMPORT INTO PRODUCTION</strong> to confirm.
                  </AlertDescription>
                </Alert>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="IMPORT INTO PRODUCTION"
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value)}
                  data-testid="input-confirm-phrase"
                />
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={validationConfirmed} onChange={e => setValidationConfirmed(e.target.checked)} />
                  I have reviewed the preview and confirm this data is correct
                </label>
              </>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)}>Back to Preview</Button>
              <Button
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending || (isProduction && (confirmPhrase !== "IMPORT INTO PRODUCTION" || !validationConfirmed))}
                data-testid="button-confirm-import"
              >
                {commitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Import {totalRows} Employees
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {step === 4 && commitResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{commitResult.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{commitResult.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped (duplicates)</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{commitResult.errored}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>
            {commitResult.errors?.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Row Errors (first 10):</p>
                {commitResult.errors.slice(0, 10).map((e: any, i: number) => (
                  <p key={i} className="text-xs text-destructive">Row {e.row}: {e.error}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Link href="/employees"><Button>View Employees</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past batches */}
      {batches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Import Batches</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {batches.slice(0, 5).map((b) => {
                const canRollback = b.status === "committed" && !b.rolledBackAt && b.committedAt
                  && (Date.now() - new Date(b.committedAt).getTime()) < 86400000;
                return (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{b.sourceFileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.createdRows} created · {b.skippedRows} skipped · {b.failedRows} failed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{b.status}</Badge>
                      {canRollback && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rollbackMutation.mutate(b.id)}
                          disabled={rollbackMutation.isPending}
                          data-testid={`button-rollback-${b.id}`}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
