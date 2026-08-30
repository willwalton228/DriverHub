import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, AlertCircle, Download, X, Loader2, CheckCircle2, SkipForward, AlertTriangle, Users } from "lucide-react";
import Papa from "papaparse";

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

interface FieldOption {
  value: string;
  label: string;
  required?: boolean;
}

const FIELD_OPTIONS: FieldOption[] = [
  { value: "_skip", label: "-- Skip this column --" },
  { value: "firstName", label: "First Name", required: true },
  { value: "lastName", label: "Last Name", required: true },
  { value: "email", label: "Email", required: true },
  { value: "phone", label: "Phone" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zipCode", label: "ZIP Code" },
  { value: "source", label: "Source" },
  { value: "sourceDetails", label: "Source Details" },
  { value: "notes", label: "Notes" },
  { value: "yearsExperience", label: "Years Experience" },
  { value: "licenseClass", label: "License Class" },
  { value: "licenseState", label: "License State" },
  { value: "currentTitle", label: "Current Title" },
  { value: "currentCompany", label: "Current Company" },
];

const REQUIRED_FIELDS = ["firstName", "lastName", "email"];

interface ImportResult {
  totalProcessed: number;
  created: number;
  skipped: number;
  updated: number;
  errored: number;
  errors: { row: number; data: any; reason: string }[];
  skippedRows: { row: number; data: any; matchedOn: string; existingName: string }[];
}

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    firstName: /^(first[_\s]?name|fname|given[_\s]?name|first)$/i,
    lastName: /^(last[_\s]?name|lname|surname|family[_\s]?name|last)$/i,
    email: /^(email|e[_\s]?mail|email[_\s]?address)$/i,
    phone: /^(phone|telephone|tel|mobile|cell|phone[_\s]?number)$/i,
    city: /^(city|town)$/i,
    state: /^(state|province|region)$/i,
    zipCode: /^(zip|zip[_\s]?code|postal|postal[_\s]?code)$/i,
    source: /^(source|origin|channel|lead[_\s]?source)$/i,
    sourceDetails: /^(source[_\s]?detail|referrer|referred[_\s]?by)$/i,
    notes: /^(notes?|comments?|remarks?)$/i,
    yearsExperience: /^(years?[_\s]?exp|experience|yrs[_\s]?exp)$/i,
    licenseClass: /^(license[_\s]?class|cdl[_\s]?class|class)$/i,
    licenseState: /^(license[_\s]?state|cdl[_\s]?state)$/i,
    currentTitle: /^(title|current[_\s]?title|job[_\s]?title|position)$/i,
    currentCompany: /^(company|current[_\s]?company|employer|organization)$/i,
  };

  for (const header of headers) {
    for (const [field, regex] of Object.entries(patterns)) {
      if (regex.test(header.trim()) && !Object.values(mapping).includes(field)) {
        mapping[header] = field;
        break;
      }
    }
    if (!mapping[header]) {
      mapping[header] = "";
    }
  }
  return mapping;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update">("skip");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");

  const resetState = useCallback(() => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setFieldMapping({});
    setDuplicateAction("skip");
    setImportResult(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback((val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  }, [onOpenChange, resetState]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast({ title: "Invalid file type", description: "Please upload a CSV file.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          toast({ title: "Invalid CSV", description: "CSV must have a header row and at least one data row.", variant: "destructive" });
          return;
        }

        const headers = results.meta.fields || [];
        if (headers.length === 0) {
          toast({ title: "Invalid CSV", description: "Could not detect column headers.", variant: "destructive" });
          return;
        }

        const rows = (results.data as Record<string, string>[]).map((row) => {
          const cleaned: Record<string, string> = {};
          headers.forEach((h) => { cleaned[h] = (row[h] || "").trim(); });
          return cleaned;
        });

        setCsvHeaders(headers);
        setCsvRows(rows);
        setFieldMapping(autoDetectMapping(headers));
        setStep("mapping");
      },
      error: () => {
        toast({ title: "CSV Parse Error", description: "Could not parse the CSV file. Please check the format.", variant: "destructive" });
      },
    });
  }, [toast]);

  const mappedRequiredFields = REQUIRED_FIELDS.filter((f) =>
    Object.values(fieldMapping).includes(f)
  );
  const missingRequiredFields = REQUIRED_FIELDS.filter(
    (f) => !Object.values(fieldMapping).includes(f)
  );

  const validationErrors: { row: number; reason: string }[] = [];
  if (step === "preview") {
    csvRows.forEach((row, idx) => {
      const mapped: Record<string, string> = {};
      for (const [csvCol, dbField] of Object.entries(fieldMapping)) {
        if (dbField) mapped[dbField] = row[csvCol] || "";
      }
      if (!mapped.firstName?.trim()) validationErrors.push({ row: idx + 1, reason: "Missing first name" });
      if (!mapped.lastName?.trim()) validationErrors.push({ row: idx + 1, reason: "Missing last name" });
      if (!mapped.email?.trim()) validationErrors.push({ row: idx + 1, reason: "Missing email" });
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email.trim())) {
        validationErrors.push({ row: idx + 1, reason: `Invalid email: ${mapped.email}` });
      }
    });
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recruiting/candidates/import", {
        rows: csvRows,
        fieldMapping,
        duplicateAction,
      });
      return res.json();
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      setStep("results");
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message || "An error occurred during import.", variant: "destructive" });
      setStep("preview");
    },
  });

  const handleStartImport = useCallback(() => {
    setStep("importing");
    importMutation.mutate();
  }, [importMutation]);

  const downloadErrorReport = useCallback(() => {
    if (!importResult) return;
    const lines: string[] = ["Type,Row,Details,Reason"];
    importResult.errors.forEach((e) => {
      const dataStr = Object.values(e.data).join(" | ");
      lines.push(`Error,${e.row},"${dataStr}","${e.reason}"`);
    });
    importResult.skippedRows.forEach((s) => {
      const dataStr = Object.values(s.data).join(" | ");
      lines.push(`Skipped,${s.row},"${dataStr}","Duplicate matched on ${s.matchedOn} (existing: ${s.existingName})"`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [importResult]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-csv-import">
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Use the new Import Wizard for CSV imports</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">The dedicated Import Wizard supports larger files, column mapping, 10-row preview, and 24-hour rollback.</p>
            <Button
              size="sm"
              variant="outline"
              className="self-start mt-1"
              onClick={() => { onOpenChange(false); navigate("/recruiting/import"); }}
              data-testid="button-go-to-import-wizard"
            >
              Open Import Wizard
            </Button>
          </div>
        </div>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Candidates from CSV
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV file to import candidates into your talent pool."}
            {step === "mapping" && "Map CSV columns to candidate fields."}
            {step === "preview" && "Review the data before importing."}
            {step === "importing" && "Importing candidates..."}
            {step === "results" && "Import complete. Review the results below."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Drag and drop or click to upload a CSV file
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                  data-testid="input-csv-file"
                />
                <Button onClick={() => fileInputRef.current?.click()} data-testid="button-select-csv">
                  <Upload className="mr-2 h-4 w-4" />
                  Select CSV File
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Expected Format</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Your CSV should have a header row. Required fields: First Name, Last Name, Email.
                  Optional: Phone, City, State, ZIP, Source, Notes, Years Experience, License Class, etc.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                File: <span className="font-medium text-foreground">{fileName}</span> ({csvRows.length} rows)
              </p>
              <div className="flex items-center gap-2">
                {missingRequiredFields.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Missing: {missingRequiredFields.map(f => FIELD_OPTIONS.find(o => o.value === f)?.label).join(", ")}
                  </Badge>
                )}
                {missingRequiredFields.length === 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="mr-1 h-3 w-3" />
                    All required fields mapped
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-3">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-4" data-testid={`mapping-row-${header}`}>
                    <div className="w-1/3">
                      <Label className="text-sm font-medium">{header}</Label>
                      <p className="text-xs text-muted-foreground truncate">
                        e.g. {csvRows[0]?.[header] || "(empty)"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="w-1/2">
                      <Select
                        value={fieldMapping[header] || "_skip"}
                        onValueChange={(val) => setFieldMapping((prev) => ({ ...prev, [header]: val === "_skip" ? "" : val }))}
                      >
                        <SelectTrigger data-testid={`select-mapping-${header}`}>
                          <SelectValue placeholder="Skip this column" />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                              {opt.required && " *"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Label className="text-sm">When duplicates are found:</Label>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Skip</Label>
                <Switch
                  checked={duplicateAction === "update"}
                  onCheckedChange={(checked) => setDuplicateAction(checked ? "update" : "skip")}
                  data-testid="switch-duplicate-action"
                />
                <Label className="text-sm text-muted-foreground">Update existing</Label>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { resetState(); }} data-testid="button-back-upload">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={missingRequiredFields.length > 0}
                data-testid="button-proceed-preview"
              >
                Preview Data
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm">
                <span className="font-medium">{csvRows.length}</span> rows to import
              </p>
              {validationErrors.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {validationErrors.length} validation issue(s)
                </Badge>
              )}
              {validationErrors.length === 0 && (
                <Badge variant="secondary">
                  <Check className="mr-1 h-3 w-3" />
                  All rows valid
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-[35vh] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {Object.entries(fieldMapping).filter(([, v]) => v).map(([csvCol, dbField]) => (
                      <TableHead key={csvCol}>
                        {FIELD_OPTIONS.find(o => o.value === dbField)?.label || dbField}
                      </TableHead>
                    ))}
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 50).map((row, idx) => {
                    const rowErrors = validationErrors.filter(e => e.row === idx + 1);
                    return (
                      <TableRow key={idx} data-testid={`preview-row-${idx}`}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        {Object.entries(fieldMapping).filter(([, v]) => v).map(([csvCol]) => (
                          <TableCell key={csvCol} className="text-sm max-w-[150px] truncate">
                            {row[csvCol] || <span className="text-muted-foreground italic">empty</span>}
                          </TableCell>
                        ))}
                        <TableCell>
                          {rowErrors.length > 0 ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Error
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Check className="mr-1 h-3 w-3" />
                              OK
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {csvRows.length > 50 && (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  Showing first 50 of {csvRows.length} rows
                </p>
              )}
            </ScrollArea>

            {validationErrors.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Validation Issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[100px]">
                    <div className="space-y-1">
                      {validationErrors.slice(0, 20).map((e, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          Row {e.row}: {e.reason}
                        </p>
                      ))}
                      {validationErrors.length > 20 && (
                        <p className="text-xs text-muted-foreground italic">
                          ...and {validationErrors.length - 20} more issues
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {duplicateAction === "skip" ? "Skip duplicates" : "Update duplicates"}
              </Badge>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("mapping")} data-testid="button-back-mapping">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleStartImport} data-testid="button-start-import">
                <Upload className="mr-2 h-4 w-4" />
                Import {csvRows.length} Candidates
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Importing candidates... This may take a moment.
            </p>
            <Progress value={undefined} className="w-64" data-testid="progress-import" />
          </div>
        )}

        {step === "results" && importResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card data-testid="stat-created">
                <CardContent className="flex flex-col items-center py-4">
                  <CheckCircle2 className="h-6 w-6 text-green-600 mb-1" />
                  <p className="text-2xl font-bold">{importResult.created}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </CardContent>
              </Card>
              <Card data-testid="stat-skipped">
                <CardContent className="flex flex-col items-center py-4">
                  <SkipForward className="h-6 w-6 text-yellow-600 mb-1" />
                  <p className="text-2xl font-bold">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </CardContent>
              </Card>
              {importResult.updated > 0 && (
                <Card data-testid="stat-updated">
                  <CardContent className="flex flex-col items-center py-4">
                    <Users className="h-6 w-6 text-blue-600 mb-1" />
                    <p className="text-2xl font-bold">{importResult.updated}</p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </CardContent>
                </Card>
              )}
              <Card data-testid="stat-errored">
                <CardContent className="flex flex-col items-center py-4">
                  <AlertCircle className="h-6 w-6 text-destructive mb-1" />
                  <p className="text-2xl font-bold">{importResult.errored}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Processed {importResult.totalProcessed} row(s) total
            </p>

            {(importResult.errors.length > 0 || importResult.skippedRows.length > 0) && (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Issues Detail</CardTitle>
                    <CardDescription className="text-xs">
                      {importResult.errors.length} error(s), {importResult.skippedRows.length} duplicate(s) skipped
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadErrorReport} data-testid="button-download-errors">
                    <Download className="mr-2 h-3 w-3" />
                    Download Report
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[150px]">
                    <div className="space-y-1">
                      {importResult.errors.slice(0, 10).map((e, i) => (
                        <p key={`err-${i}`} className="text-xs text-destructive">
                          Row {e.row}: {e.reason}
                        </p>
                      ))}
                      {importResult.skippedRows.slice(0, 10).map((s, i) => (
                        <p key={`skip-${i}`} className="text-xs text-yellow-600 dark:text-yellow-500">
                          Row {s.row}: Duplicate ({s.matchedOn}) - existing: {s.existingName}
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            <DialogFooter>
              <Button onClick={() => handleClose(false)} data-testid="button-close-import">
                <Check className="mr-2 h-4 w-4" />
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}