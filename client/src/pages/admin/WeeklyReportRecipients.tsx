import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone } from "@/components/ui/FileDropZone";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Upload, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Pencil, Trash2, Plus, Search, RefreshCw, Download,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Recipient {
  id: string;
  accountId: string | null;
  accountName: string | null;
  recipientName: string | null;
  recipientEmail: string;
  recipientType: "TO" | "CC";
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ValidatedRow {
  rowIndex: number;
  accountId: string | null;
  accountName: string | null;
  recipientName: string | null;
  recipientEmail: string;
  recipientType: "TO" | "CC";
  active: boolean;
  notes: string | null;
  status: "valid" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
}

type ImportStep = "idle" | "parsing" | "preview" | "committing" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const headers = [
    ["Account ID", "Account Name", "Recipient Name", "Recipient Email", "Recipient Type", "Active"],
    ["", "Acme Corp", "Jane Smith", "jane@acme.com", "TO", "Yes"],
    ["", "Acme Corp", "Bob Jones", "bob@acme.com", "CC", "Yes"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(headers);
  ws["!cols"] = [{ wch: 36 }, { wch: 28 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "Recipients");
  XLSX.writeFile(wb, "weekly_report_recipients_template.xlsx");
}

const STATUS_CONFIG = {
  valid:     { label: "Valid",     className: "bg-green-600 text-white" },
  invalid:   { label: "Invalid",   className: "text-destructive border-destructive" },
  duplicate: { label: "Duplicate", className: "text-amber-600 dark:text-amber-400 border-amber-500" },
} as const;

// ── Import Tab ────────────────────────────────────────────────────────────────

function ImportTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [file, setFile]             = useState<File | null>(null);
  const [step, setStep]             = useState<ImportStep>("idle");
  const [previewRows, setPreviewRows] = useState<ValidatedRow[]>([]);
  const [counts, setCounts]           = useState<Record<string, number>>({});
  const [commitResult, setCommitResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setStep("idle");
    setPreviewRows([]);
    setCommitResult(null);
  }, []);

  async function handleParse() {
    if (!file) return;
    setStep("parsing");
    try {
      const rawRows = await parseFile(file);
      if (rawRows.length === 0) {
        toast({ title: "Empty file", description: "No data rows found.", variant: "destructive" });
        setStep("idle");
        return;
      }
      const res = await apiRequest("POST", "/api/weekly-report-recipients/import/validate", { rows: rawRows });
      const data = await res.json();
      setPreviewRows(data.rows ?? []);
      setCounts(data.counts ?? {});
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Parse failed", description: e.message, variant: "destructive" });
      setStep("idle");
    }
  }

  async function handleCommit() {
    const validRows = previewRows.filter(r => r.status === "valid");
    if (validRows.length === 0) return;
    setStep("committing");
    try {
      const res = await apiRequest("POST", "/api/weekly-report-recipients/import/commit", { rows: validRows });
      const data = await res.json();
      setCommitResult(data);
      qc.invalidateQueries({ queryKey: ["/api/weekly-report-recipients"] });
      setStep("done");
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
      setStep("preview");
    }
  }

  function handleReset() {
    setFile(null);
    setStep("idle");
    setPreviewRows([]);
    setCounts({});
    setCommitResult(null);
    setFilterStatus("all");
  }

  const validCount     = counts.valid ?? 0;
  const invalidCount   = counts.invalid ?? 0;
  const duplicateCount = counts.duplicate ?? 0;

  const filteredRows = filterStatus === "all"
    ? previewRows
    : previewRows.filter(r => r.status === filterStatus);

  return (
    <div className="space-y-5">

      {/* Upload card */}
      {step === "idle" || step === "parsing" ? (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Upload Recipient File</CardTitle>
            <CardDescription>
              Upload a CSV or XLSX file with recipient information. Accounts are matched by ID first, then by exact name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropZone
              onFileSelect={handleFileSelect}
              selectedFile={file}
              onClear={() => { setFile(null); setStep("idle"); }}
              disabled={step === "parsing"}
              testId="dropzone-recipients"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleParse}
                disabled={!file || step === "parsing"}
                data-testid="button-parse-file"
              >
                {step === "parsing"
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing…</>
                  : <><Upload className="h-4 w-4 mr-1.5" />Preview Import</>
                }
              </Button>
              <Button
                variant="outline"
                onClick={downloadTemplate}
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download Template
              </Button>
            </div>

            {/* Column hint */}
            <div className="rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Expected columns:</p>
              <p>Account ID, Account Name, Recipient Name, Recipient Email, Recipient Type (TO/CC), Active (Yes/No)</p>
              <p className="mt-1">Column headers are case-insensitive. Account matching tries ID first, then Name.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Preview */}
      {(step === "preview" || step === "committing" || step === "done") && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Preview Import</CardTitle>
                <CardDescription className="mt-1">
                  Review rows before committing. Only <strong>Valid</strong> rows will be inserted.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-600 text-white">{validCount} Valid</Badge>
                {duplicateCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500">
                    {duplicateCount} Duplicate
                  </Badge>
                )}
                {invalidCount > 0 && (
                  <Badge variant="outline" className="text-destructive border-destructive">
                    {invalidCount} Invalid
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Filter pills */}
            <div className="flex flex-wrap gap-2">
              {["all", "valid", "invalid", "duplicate"].map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={filterStatus === s ? "default" : "outline"}
                  onClick={() => setFilterStatus(s)}
                  data-testid={`filter-${s}`}
                >
                  {s === "all" ? `All (${previewRows.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s] ?? 0})`}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-16">Type</TableHead>
                    <TableHead className="w-16">Active</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                        No rows to show.
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.map(row => (
                    <TableRow
                      key={row.rowIndex}
                      className={row.status === "invalid" ? "bg-destructive/5" : row.status === "duplicate" ? "bg-amber-500/5" : ""}
                      data-testid={`preview-row-${row.rowIndex}`}
                    >
                      <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.status === "valid" ? "default" : "outline"}
                          className={`text-xs ${STATUS_CONFIG[row.status]?.className ?? ""}`}
                        >
                          {STATUS_CONFIG[row.status]?.label ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px]">
                        {row.accountName
                          ? <span>{row.accountName}</span>
                          : <span className="text-muted-foreground italic">Unassigned</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{row.recipientName ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate font-mono text-xs">{row.recipientEmail}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{row.recipientType}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.active ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-xs max-w-[220px]">
                        {row.errors.length > 0 && (
                          <div className="text-destructive space-y-0.5">
                            {row.errors.map((e, i) => <div key={i}>{e}</div>)}
                          </div>
                        )}
                        {row.warnings.length > 0 && (
                          <div className="text-amber-600 dark:text-amber-400 space-y-0.5">
                            {row.warnings.map((w, i) => <div key={i}>{w}</div>)}
                          </div>
                        )}
                        {row.errors.length === 0 && row.warnings.length === 0 && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Actions */}
            {step !== "done" && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  onClick={handleCommit}
                  disabled={validCount === 0 || step === "committing"}
                  data-testid="button-commit-import"
                >
                  {step === "committing"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Committing…</>
                    : `Commit ${validCount} Valid Row${validCount !== 1 ? "s" : ""}`
                  }
                </Button>
                <Button variant="outline" onClick={handleReset} data-testid="button-reset-import">
                  Start Over
                </Button>
                {validCount === 0 && (
                  <span className="text-xs text-muted-foreground">No valid rows to commit.</span>
                )}
              </div>
            )}

            {/* Commit result */}
            {step === "done" && commitResult && (
              <div className="flex items-start gap-3 rounded-md bg-green-500/10 px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-0.5">
                  <p className="font-medium text-green-700 dark:text-green-400">
                    Import complete — {commitResult.inserted} recipient{commitResult.inserted !== 1 ? "s" : ""} added
                  </p>
                  {commitResult.skipped > 0 && (
                    <p className="text-muted-foreground text-xs">{commitResult.skipped} rows skipped (already existed).</p>
                  )}
                </div>
              </div>
            )}
            {step === "done" && (
              <Button variant="outline" onClick={handleReset} data-testid="button-new-import">
                New Import
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Add / Edit Dialog ─────────────────────────────────────────────────────────

interface RecipientFormState {
  accountId: string;
  recipientName: string;
  recipientEmail: string;
  recipientType: string;
  active: boolean;
  notes: string;
}

const BLANK_FORM: RecipientFormState = {
  accountId: "",
  recipientName: "",
  recipientEmail: "",
  recipientType: "TO",
  active: true,
  notes: "",
};

interface RecipientDialogProps {
  open: boolean;
  mode: "add" | "edit";
  initial?: Partial<RecipientFormState>;
  editId?: string;
  accounts: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function RecipientDialog({ open, mode, initial, editId, accounts, onClose, onSaved }: RecipientDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<RecipientFormState>({ ...BLANK_FORM, ...(initial ?? {}) });

  // Reset when opening
  const handleOpenChange = (o: boolean) => {
    if (o) setForm({ ...BLANK_FORM, ...(initial ?? {}) });
    if (!o) onClose();
  };

  const set = <K extends keyof RecipientFormState>(k: K) => (v: RecipientFormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        accountId:      form.accountId || null,
        recipientName:  form.recipientName.trim() || null,
        recipientEmail: form.recipientEmail.trim(),
        recipientType:  form.recipientType,
        active:         form.active,
        notes:          form.notes.trim() || null,
      };
      if (mode === "add") return apiRequest("POST", "/api/weekly-report-recipients", body);
      return apiRequest("PATCH", `/api/weekly-report-recipients/${editId}`, body);
    },
    onSuccess: () => {
      toast({ title: mode === "add" ? "Recipient added" : "Recipient updated" });
      onSaved();
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recipientEmail);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-recipient">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Recipient" : "Edit Recipient"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Add a new weekly report recipient." : "Update recipient details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Account <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Select value={form.accountId || "__none__"} onValueChange={v => set("accountId")(v === "__none__" ? "" : v)}>
              <SelectTrigger data-testid="select-recipient-account">
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Unassigned —</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Recipient Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={form.recipientName}
                onChange={e => set("recipientName")(e.target.value)}
                placeholder="Jane Smith"
                data-testid="input-recipient-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label required>Recipient Email</Label>
              <Input
                type="email"
                value={form.recipientEmail}
                onChange={e => set("recipientEmail")(e.target.value)}
                placeholder="jane@example.com"
                data-testid="input-recipient-email"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.recipientType} onValueChange={set("recipientType")}>
                <SelectTrigger data-testid="select-recipient-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TO">TO — Primary Recipient</SelectItem>
                  <SelectItem value="CC">CC — Carbon Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 pt-6">
              <Label className="text-sm font-medium">Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={set("active")}
                data-testid="switch-recipient-active"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes")(e.target.value)}
              placeholder="Internal notes…"
              className="resize-none"
              rows={2}
              data-testid="input-recipient-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!isValid || saveMutation.isPending}
            data-testid="button-save-recipient"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Recipients List Tab ───────────────────────────────────────────────────────

function RecipientsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch]             = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [dialogMode, setDialogMode]     = useState<"add" | "edit">("add");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<Recipient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipient | null>(null);

  const { data: recipients = [], isLoading, refetch, isFetching } = useQuery<Recipient[]>({
    queryKey: ["/api/weekly-report-recipients"],
    queryFn: () =>
      fetch("/api/weekly-report-recipients", { credentials: "include" }).then(r => r.json()),
  });

  // Derive account list for filter + dialog
  const accounts = Array.from(
    new Map(
      recipients
        .filter(r => r.accountId && r.accountName)
        .map(r => [r.accountId!, { id: r.accountId!, name: r.accountName! }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/weekly-report-recipients/${id}`),
    onSuccess: () => {
      toast({ title: "Recipient removed" });
      qc.invalidateQueries({ queryKey: ["/api/weekly-report-recipients"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const filtered = recipients.filter(r => {
    const matchAccount = accountFilter === "all" || r.accountId === accountFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || (r.recipientEmail.toLowerCase().includes(q))
      || (r.recipientName?.toLowerCase().includes(q) ?? false)
      || (r.accountName?.toLowerCase().includes(q) ?? false);
    return matchAccount && matchSearch;
  });

  function openAdd() {
    setDialogMode("add");
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(r: Recipient) {
    setDialogMode("edit");
    setEditTarget(r);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, account…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-recipients"
          />
        </div>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-account">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-recipients"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={openAdd} data-testid="button-add-recipient">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Recipient
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Recipient Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-16">Type</TableHead>
              <TableHead className="w-16">Active</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                  {recipients.length === 0
                    ? "No recipients yet. Use Import or Add Recipient to get started."
                    : "No recipients match the current filter."
                  }
                </TableCell>
              </TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id} data-testid={`row-recipient-${r.id}`}>
                <TableCell className="text-sm max-w-[160px]">
                  {r.accountName
                    ? <span className="font-medium">{r.accountName}</span>
                    : <span className="text-muted-foreground italic text-xs">Unassigned</span>
                  }
                </TableCell>
                <TableCell className="text-sm max-w-[150px] truncate">{r.recipientName ?? "—"}</TableCell>
                <TableCell className="text-sm font-mono text-xs max-w-[200px] truncate">{r.recipientEmail}</TableCell>
                <TableCell>
                  <Badge
                    variant={r.recipientType === "TO" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {r.recipientType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.active
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    : <XCircle className="h-4 w-4 text-muted-foreground" />
                  }
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                  {r.notes ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {r.createdAt ? format(new Date(r.createdAt), "MMM d, yyyy") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                      data-testid={`button-edit-recipient-${r.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(r)}
                      data-testid={`button-delete-recipient-${r.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} recipient{filtered.length !== 1 ? "s" : ""}
          {recipients.length !== filtered.length ? ` of ${recipients.length} total` : ""}
        </p>
      )}

      {/* Add/Edit dialog */}
      <RecipientDialog
        open={dialogOpen}
        mode={dialogMode}
        editId={editTarget?.id}
        initial={editTarget ? {
          accountId:      editTarget.accountId ?? "",
          recipientName:  editTarget.recipientName ?? "",
          recipientEmail: editTarget.recipientEmail,
          recipientType:  editTarget.recipientType,
          active:         editTarget.active,
          notes:          editTarget.notes ?? "",
        } : undefined}
        accounts={accounts}
        onClose={() => setDialogOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["/api/weekly-report-recipients"] })}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete-recipient">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.recipientEmail}</strong> from weekly report recipients?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-recipient"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeeklyReportRecipients() {
  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-indigo-500/10 p-2">
          <Users className="h-5 w-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Weekly Report Recipients</h1>
          <p className="text-sm text-muted-foreground">
            Manage recipients for automated weekly schedule report delivery.
          </p>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="recipients">
        <TabsList>
          <TabsTrigger value="recipients" data-testid="tab-recipients">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Recipients
          </TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Bulk Import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipients" className="mt-5">
          <RecipientsTab />
        </TabsContent>

        <TabsContent value="import" className="mt-5">
          <ImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
