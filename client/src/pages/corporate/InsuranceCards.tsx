import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle2, Shield, Upload, RefreshCw, ArchiveX,
  Download, Plus, X, Loader2, ChevronRight, ArrowRight,
} from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

function parseStateFromFilename(filename: string): string {
  const match = filename.match(/[-\s]+([A-Za-z]{2})(?:\.\w+)?$/);
  if (match) {
    const abbr = match[1].toUpperCase();
    if (US_STATES.includes(abbr)) return abbr;
  }
  return "";
}

interface InsuranceCard {
  id: number;
  batch_id: number | null;
  state: string;
  document_type: string;
  effective_date: string | null;
  expiration_date: string | null;
  active: boolean;
  storage_key: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  archived_at: string | null;
  batch_name: string | null;
  policy_year: number | null;
  batch_status: string | null;
}

interface InsuranceCardBatch {
  id: number;
  batch_name: string;
  policy_year: number | null;
  status: string;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
  card_count: number;
}

interface StagedFile {
  file: File;
  state: string;
  effectiveDate: string;
  expirationDate: string;
}

function fmtDate(val: string | null | undefined) {
  if (!val) return "—";
  try { return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return val; }
}

function StatusBadge({ card }: { card: InsuranceCard }) {
  if (card.archived_at) return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>;
  if (card.active) return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40">Active</Badge>;
  return <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">Inactive</Badge>;
}

function StagedFilesTable({ files, onChange }: {
  files: StagedFile[];
  onChange: (updated: StagedFile[]) => void;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead className="w-[90px]">State</TableHead>
            <TableHead className="w-[130px]">Effective</TableHead>
            <TableHead className="w-[130px]">Expires</TableHead>
            <TableHead className="w-8"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((sf, i) => (
            <TableRow key={i}>
              <TableCell className="text-sm text-muted-foreground max-w-[170px] truncate" title={sf.file.name}>
                {sf.file.name}
              </TableCell>
              <TableCell>
                <Select
                  value={sf.state || "_none"}
                  onValueChange={v => onChange(files.map((f, idx) => idx === i ? { ...f, state: v === "_none" ? "" : v } : f))}
                >
                  <SelectTrigger className="w-[72px]" data-testid={`select-staged-state-${i}`}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="date"
                  value={sf.effectiveDate}
                  onChange={e => onChange(files.map((f, idx) => idx === i ? { ...f, effectiveDate: e.target.value } : f))}
                  className="text-xs"
                  data-testid={`input-effective-${i}`}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="date"
                  value={sf.expirationDate}
                  onChange={e => onChange(files.map((f, idx) => idx === i ? { ...f, expirationDate: e.target.value } : f))}
                  className="text-xs"
                  data-testid={`input-expiration-${i}`}
                />
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => onChange(files.filter((_, idx) => idx !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StagedWarnings({ files }: { files: StagedFile[] }) {
  const missing = files.filter(f => !f.state).length;
  const states = files.map(f => f.state).filter(Boolean);
  const dupes = [...new Set(states.filter((s, i) => states.indexOf(s) !== i))];
  if (!missing && !dupes.length) return null;
  return (
    <div className="space-y-1.5">
      {missing > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{missing} file{missing !== 1 ? "s" : ""} missing a state — please select before uploading.</span>
        </div>
      )}
      {dupes.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Duplicate states detected: {dupes.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

export default function InsuranceCards() {
  const { isSuperAdmin, isCorporate } = useAuth();
  const { toast } = useToast();

  const [filterState, setFilterState]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");

  const [uploadOpen, setUploadOpen]   = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  const [reloadOpen, setReloadOpen]         = useState(false);
  const [reloadStep, setReloadStep]         = useState<1 | 2 | 3>(1);
  const [reloadBatchId, setReloadBatchId]   = useState<number | null>(null);
  const [reloadBatchName, setReloadBatchName] = useState(`${new Date().getFullYear()} Policy Year`);
  const [reloadFiles, setReloadFiles]       = useState<StagedFile[]>([]);
  const reloadFileRef = useRef<HTMLInputElement>(null);

  const isAdmin = isSuperAdmin || isCorporate;

  const { data: cards = [], isLoading } = useQuery<InsuranceCard[]>({
    queryKey: ["/api/insurance-cards", filterStatus],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filterStatus === "archived") p.set("includeArchived", "true");
      const r = await fetch(`/api/insurance-cards?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: isAdmin,
  });

  const { data: batches = [] } = useQuery<InsuranceCardBatch[]>({
    queryKey: ["/api/insurance-cards/batches"],
    enabled: isAdmin,
  });

  const createBatchMutation = useMutation({
    mutationFn: (d: { batchName: string; policyYear?: number }) =>
      apiRequest("POST", "/api/insurance-cards/batches", d).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards/batches"] }),
  });

  const activateBatchMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/insurance-cards/batches/${id}/activate`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards/batches"] });
      toast({ title: "Batch activated", description: "Insurance cards are now live." });
      setReloadOpen(false);
      setReloadStep(1);
      setReloadBatchId(null);
      setReloadFiles([]);
    },
    onError: (e: any) => toast({ title: "Activation failed", description: e.message, variant: "destructive" }),
  });

  const archiveCardMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/insurance-cards/${id}/archive`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
      toast({ title: "Card archived" });
    },
    onError: (e: any) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const filteredCards = cards.filter(c => {
    if (filterState !== "all" && c.state !== filterState) return false;
    if (filterStatus === "active"   && (!c.active || !!c.archived_at))  return false;
    if (filterStatus === "inactive" && (c.active  || !!c.archived_at))  return false;
    if (filterStatus === "archived" && !c.archived_at) return false;
    return true;
  });

  const activeBatch = batches.find(b => b.status === "active");

  function filesToStaged(files: FileList | null): StagedFile[] {
    if (!files) return [];
    return Array.from(files).map(f => ({
      file: f,
      state: parseStateFromFilename(f.name),
      effectiveDate: "",
      expirationDate: "",
    }));
  }

  async function uploadFiles(staged: StagedFile[], batchId: number | null): Promise<{ ok: number; fail: number }> {
    setUploading(true);
    setProgress(0);
    let ok = 0; let fail = 0;
    for (let i = 0; i < staged.length; i++) {
      const sf = staged[i];
      try {
        const buf = await sf.file.arrayBuffer();
        const uploadRes = await fetch("/api/objects/upload-file", {
          method: "POST",
          headers: {
            "Content-Type": sf.file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(sf.file.name),
          },
          body: buf,
          credentials: "include",
        });
        if (!uploadRes.ok) throw new Error((await uploadRes.json().catch(() => ({}))).message || "Upload failed");
        const { objectPath } = await uploadRes.json();
        await apiRequest("POST", "/api/insurance-cards", {
          state: sf.state.toUpperCase(),
          effectiveDate: sf.effectiveDate || null,
          expirationDate: sf.expirationDate || null,
          batchId,
          storageKey: objectPath,
          fileName: sf.file.name,
          contentType: sf.file.type || "application/octet-stream",
          fileSizeBytes: sf.file.size,
        });
        ok++;
      } catch (err: any) {
        fail++;
        console.error("[InsuranceCards] upload failed for", sf.file.name, err.message);
      }
      setProgress(Math.round(((i + 1) / staged.length) * 100));
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
    return { ok, fail };
  }

  async function handleConfirmUpload() {
    const { ok, fail } = await uploadFiles(stagedFiles, null);
    if (fail === 0) toast({ title: `${ok} card${ok !== 1 ? "s" : ""} uploaded successfully` });
    else toast({ title: `${ok} uploaded, ${fail} failed`, variant: fail > 0 && ok === 0 ? "destructive" : "default" });
    setUploadOpen(false);
    setStagedFiles([]);
  }

  async function handleReloadStep1() {
    const yr = parseInt(reloadBatchName.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear()));
    try {
      const batch = await createBatchMutation.mutateAsync({ batchName: reloadBatchName, policyYear: yr || new Date().getFullYear() });
      setReloadBatchId(batch.id);
      setReloadStep(2);
    } catch (e: any) {
      toast({ title: "Failed to create batch", description: e.message, variant: "destructive" });
    }
  }

  async function handleReloadStep2() {
    if (!reloadFiles.length) {
      toast({ title: "No files selected", description: "Select at least one file to upload.", variant: "destructive" });
      return;
    }
    const { ok, fail } = await uploadFiles(reloadFiles, reloadBatchId);
    if (ok > 0) {
      setReloadFiles([]);
      setReloadStep(3);
    }
    if (fail > 0) toast({ title: `${fail} file${fail !== 1 ? "s" : ""} failed to upload`, variant: "destructive" });
  }

  const reloadBatchCards = cards.filter(c => c.batch_id === reloadBatchId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Insurance Cards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            State-specific insurance card library — managed annually for driver consumption.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => { setStagedFiles([]); setUploadOpen(true); }}
            data-testid="button-upload-cards"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Cards
          </Button>
          <Button
            onClick={() => {
              setReloadStep(1);
              setReloadBatchName(`${new Date().getFullYear()} Policy Year`);
              setReloadFiles([]);
              setReloadBatchId(null);
              setReloadOpen(true);
            }}
            data-testid="button-annual-reload"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Annual Reload
          </Button>
        </div>
      </div>

      {/* Active batch banner */}
      {activeBatch && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800/40">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm font-medium text-green-800 dark:text-green-300">Active Batch:</span>
            <span className="text-sm text-green-700 dark:text-green-400">{activeBatch.batch_name}</span>
            {activeBatch.activated_at && (
              <span className="text-xs text-green-600 dark:text-green-500 ml-1">
                — activated {fmtDate(activeBatch.activated_at)}
              </span>
            )}
            <Badge variant="outline" className="ml-auto text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 text-xs">
              {activeBatch.card_count} card{Number(activeBatch.card_count) !== 1 ? "s" : ""}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus} data-testid="select-filter-status">
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterState} onValueChange={setFilterState} data-testid="select-filter-state">
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterState !== "all" || filterStatus !== "active") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterState("all"); setFilterStatus("active"); }}>
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-14">
              <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">No insurance cards found.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload cards or adjust the filters above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">State</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCards.map(card => (
                  <TableRow key={card.id} data-testid={`row-card-${card.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono font-medium">{card.state}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={card.file_name ?? ""}>
                      {card.file_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{card.batch_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(card.effective_date)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(card.expiration_date)}</TableCell>
                    <TableCell><StatusBadge card={card} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(card.uploaded_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {card.storage_key && (
                          <Button size="icon" variant="ghost" title="Download" asChild>
                            <a href={`/api/insurance-cards/${card.id}/download`} download data-testid={`button-download-${card.id}`}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        {!card.archived_at && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Archive card"
                            onClick={() => archiveCardMutation.mutate(card.id)}
                            disabled={archiveCardMutation.isPending}
                            data-testid={`button-archive-${card.id}`}
                          >
                            <ArchiveX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Batch history */}
      {batches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Batch History</CardTitle>
            <CardDescription>Previous and current annual insurance card batches.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Name</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map(b => (
                  <TableRow key={b.id} data-testid={`row-batch-${b.id}`}>
                    <TableCell className="font-medium">{b.batch_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.policy_year ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.card_count}</TableCell>
                    <TableCell>
                      {b.status === "active"   ? <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40">Active</Badge>
                      : b.status === "archived" ? <Badge variant="outline" className="text-muted-foreground">Archived</Badge>
                      : <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(b.activated_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(b.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog open={uploadOpen} onOpenChange={v => { if (!uploading) { setUploadOpen(v); if (!v) setStagedFiles([]); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Insurance Cards</DialogTitle>
            <DialogDescription>
              Select PDF or image files. State is auto-detected from the filename (e.g., "Auto ID - TX.pdf").
              Cards are saved as inactive — use Annual Reload to activate a full batch.
            </DialogDescription>
          </DialogHeader>

          {stagedFiles.length === 0 ? (
            <div
              className="border-2 border-dashed border-border rounded-md p-10 text-center cursor-pointer hover-elevate"
              onClick={() => uploadFileRef.current?.click()}
              data-testid="dropzone-upload"
            >
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">Click to select files</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG — up to 10 MB each</p>
              <input
                ref={uploadFileRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={e => setStagedFiles(filesToStaged(e.target.files))}
                data-testid="input-file-upload"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <StagedFilesTable files={stagedFiles} onChange={setStagedFiles} />
              <StagedWarnings files={stagedFiles} />
              {uploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading…</span><span>{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => uploadFileRef.current?.click()}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add More Files
                <input
                  ref={uploadFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={e => setStagedFiles(prev => [...prev, ...filesToStaged(e.target.files)])}
                />
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setStagedFiles([]); }} disabled={uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpload}
              disabled={uploading || stagedFiles.length === 0 || stagedFiles.some(f => !f.state)}
              data-testid="button-confirm-upload"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                : <><Upload className="h-4 w-4 mr-2" />Upload {stagedFiles.length > 0 ? `${stagedFiles.length} File${stagedFiles.length !== 1 ? "s" : ""}` : "Files"}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Annual Reload Dialog ── */}
      <Dialog open={reloadOpen} onOpenChange={v => {
        if (!uploading && !activateBatchMutation.isPending) {
          setReloadOpen(v);
          if (!v) { setReloadStep(1); setReloadFiles([]); setReloadBatchId(null); }
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annual Reload</DialogTitle>
            <DialogDescription>
              Create a new batch for the upcoming policy year. The current active batch will be archived when you activate.
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {(["Name Batch", "Upload Cards", "Review & Activate"] as const).map((label, i) => {
              const step = (i + 1) as 1 | 2 | 3;
              const done = reloadStep > step;
              const active = reloadStep === step;
              return (
                <div key={label} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground opacity-40 shrink-0" />}
                  <div className={`flex items-center gap-1.5 ${active ? "text-foreground font-medium" : done ? "text-muted-foreground" : "text-muted-foreground opacity-40"}`}>
                    <div className={`h-5 w-5 rounded-full text-xs flex items-center justify-center shrink-0 ${active ? "bg-primary text-primary-foreground" : done ? "bg-muted" : "border border-border"}`}>
                      {done ? <CheckCircle2 className="h-3 w-3" /> : step}
                    </div>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Step 1 */}
          {reloadStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="batch-name">Batch Name</Label>
                <Input
                  id="batch-name"
                  value={reloadBatchName}
                  onChange={e => setReloadBatchName(e.target.value)}
                  placeholder="e.g. 2025 Policy Year"
                  data-testid="input-batch-name"
                />
                <p className="text-xs text-muted-foreground">A descriptive name, e.g. "2025 Policy Year".</p>
              </div>
              {activeBatch && (
                <div className="flex items-start gap-2 rounded-md px-3 py-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Current active batch <strong>{activeBatch.batch_name}</strong> will be archived when you activate the new batch.</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2 */}
          {reloadStep === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Upload state insurance cards for <strong>{reloadBatchName}</strong>.
                Cards are saved as inactive until you activate in the next step.
              </p>
              {reloadFiles.length === 0 ? (
                <div
                  className="border-2 border-dashed border-border rounded-md p-10 text-center cursor-pointer hover-elevate"
                  onClick={() => reloadFileRef.current?.click()}
                  data-testid="dropzone-reload"
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-sm font-medium">Click to select files</p>
                  <p className="text-xs text-muted-foreground mt-1">Multiple files — auto-detects state from filename</p>
                  <input
                    ref={reloadFileRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={e => setReloadFiles(filesToStaged(e.target.files))}
                    data-testid="input-file-reload"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <StagedFilesTable files={reloadFiles} onChange={setReloadFiles} />
                  <StagedWarnings files={reloadFiles} />
                  {uploading && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Uploading…</span><span>{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => reloadFileRef.current?.click()}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add More Files
                    <input
                      ref={reloadFileRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={e => setReloadFiles(prev => [...prev, ...filesToStaged(e.target.files)])}
                    />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3 */}
          {reloadStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <strong>{reloadBatchCards.length}</strong> card{reloadBatchCards.length !== 1 ? "s" : ""} staged in <strong>{reloadBatchName}</strong>.
                Review, then activate to make them live.
              </p>
              {reloadBatchCards.length > 0 ? (
                <div className="rounded-md border overflow-hidden max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">State</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead>Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reloadBatchCards.map(c => (
                        <TableRow key={c.id}>
                          <TableCell><Badge variant="outline" className="font-mono">{c.state}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={c.file_name ?? ""}>{c.file_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{fmtDate(c.effective_date)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(c.expiration_date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center py-6 text-sm text-muted-foreground">No cards uploaded to this batch.</p>
              )}
              {activeBatch && (
                <div className="flex items-start gap-2 rounded-md px-3 py-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Activating will archive <strong>{activeBatch.batch_name}</strong> and all its cards.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setReloadOpen(false); setReloadStep(1); setReloadFiles([]); setReloadBatchId(null); }}
              disabled={uploading || activateBatchMutation.isPending}
            >
              Cancel
            </Button>
            {reloadStep === 1 && (
              <Button onClick={handleReloadStep1} disabled={!reloadBatchName.trim() || createBatchMutation.isPending} data-testid="button-reload-next-1">
                {createBatchMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Next: Upload Cards
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {reloadStep === 2 && (
              <Button
                onClick={handleReloadStep2}
                disabled={reloadFiles.length === 0 || reloadFiles.some(f => !f.state) || uploading}
                data-testid="button-reload-next-2"
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                  : <>Next: Review<ArrowRight className="h-4 w-4 ml-2" /></>
                }
              </Button>
            )}
            {reloadStep === 3 && (
              <Button
                onClick={() => reloadBatchId && activateBatchMutation.mutate(reloadBatchId)}
                disabled={activateBatchMutation.isPending || !reloadBatchId || reloadBatchCards.length === 0}
                data-testid="button-activate-batch"
              >
                {activateBatchMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Activating…</>
                  : <><CheckCircle2 className="h-4 w-4 mr-2" />Activate Batch</>
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
