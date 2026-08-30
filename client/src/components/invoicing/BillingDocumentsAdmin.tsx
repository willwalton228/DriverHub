import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload, Download, Archive, FileText, Clock, CheckCircle2, Info,
  AlertTriangle, FilePlus2, Eye,
} from "lucide-react";

interface BillingDocument {
  id: string;
  documentType: string;
  displayName: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number | null;
  effectiveDate: string | null;
  status: "active" | "archived";
  notes: string | null;
  downloadCount: number;
  uploadedBy: string;
  uploadedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

const DOCUMENT_TYPES = [
  { value: "w9",       label: "W-9 (Tax Form)" },
  { value: "terms",    label: "Terms & Conditions" },
  { value: "ach_auth", label: "ACH Authorization Form" },
  { value: "other",    label: "Other" },
];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDatetime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function docTypeLabel(type: string): string {
  return DOCUMENT_TYPES.find(t => t.value === type)?.label ?? type.toUpperCase();
}

export function BillingDocumentsAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<BillingDocument | null>(null);

  // Upload form state
  const [docType, setDocType]         = useState("w9");
  const [displayName, setDisplayName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [notes, setNotes]             = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: docs = [], isLoading } = useQuery<BillingDocument[]>({
    queryKey: ["/api/corporate/invoicing/billing-documents"],
  });

  const active   = docs.filter(d => d.status === "active");
  const archived = docs.filter(d => d.status === "archived");

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", docType);
      formData.append("displayName", displayName || `${docTypeLabel(docType)} — ${new Date().getFullYear()}`);
      if (effectiveDate) formData.append("effectiveDate", effectiveDate);
      if (notes)         formData.append("notes", notes);

      const resp = await fetch("/api/corporate/invoicing/billing-documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/billing-documents"] });
      toast({ title: "Document uploaded", description: "The new document is now active on the billing portal." });
      resetUploadForm();
      setUploadOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/corporate/invoicing/billing-documents/${id}/archive`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/billing-documents"] });
      toast({ title: "Document archived", description: "The document has been removed from the public portal." });
      setArchiveConfirm(null);
    },
    onError: () => {
      toast({ title: "Archive failed", description: "Could not archive document.", variant: "destructive" });
    },
  });

  function resetUploadForm() {
    setDocType("w9");
    setDisplayName("");
    setEffectiveDate("");
    setNotes("");
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (f && !displayName) {
      const year = new Date().getFullYear();
      setDisplayName(`${docTypeLabel(docType)} — ${year}`);
    }
  }

  const publicBaseUrl = `${window.location.origin}/api/public/billing-documents`;

  return (
    <div className="space-y-6">

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Billing Documents</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage publicly accessible billing documents (W-9, forms, etc.) displayed on the customer payment portal.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} data-testid="button-upload-billing-doc">
          <FilePlus2 className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Active documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Active Documents
          </CardTitle>
          <CardDescription>
            These are visible to customers on the public billing portal. Only one document per type can be active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Clock className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
              <FileText className="w-8 h-8" />
              <p className="text-sm">No active documents. Upload a W-9 to make it available on the payment portal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Downloads</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Public Link</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map(doc => (
                  <TableRow key={doc.id} data-testid={`row-billing-doc-${doc.id}`}>
                    <TableCell className="font-medium max-w-[180px] truncate" title={doc.displayName}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.displayName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{doc.fileName}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{docTypeLabel(doc.documentType)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(doc.effectiveDate)}</TableCell>
                    <TableCell className="text-sm">{formatBytes(doc.fileSizeBytes)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-muted-foreground" />
                        {doc.downloadCount.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{formatDatetime(doc.uploadedAt)}</TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(`${publicBaseUrl}/${doc.documentType}/download`);
                              toast({ title: "Link copied", description: "Public download URL copied to clipboard." });
                            }}
                            data-testid={`button-copy-link-${doc.id}`}
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Copy public download URL
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          data-testid={`button-download-billing-doc-${doc.id}`}
                        >
                          <a href={`/api/corporate/invoicing/billing-documents/${doc.id}/download`} download={doc.fileName}>
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setArchiveConfirm(doc)}
                          data-testid={`button-archive-billing-doc-${doc.id}`}
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Archived history */}
      {archived.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Archive className="w-4 h-4 text-muted-foreground" />
              Version History
            </CardTitle>
            <CardDescription>
              Archived versions kept for audit/compliance. Not publicly visible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Downloads</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Archived</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archived.map(doc => (
                  <TableRow key={doc.id} className="opacity-70" data-testid={`row-archived-billing-doc-${doc.id}`}>
                    <TableCell className="font-medium max-w-[180px] truncate" title={doc.displayName}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.displayName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{doc.fileName}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{docTypeLabel(doc.documentType)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(doc.effectiveDate)}</TableCell>
                    <TableCell className="text-sm">{formatBytes(doc.fileSizeBytes)}</TableCell>
                    <TableCell className="text-sm">{doc.downloadCount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{formatDatetime(doc.uploadedAt)}</TableCell>
                    <TableCell className="text-sm">{formatDatetime(doc.archivedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        data-testid={`button-download-archived-${doc.id}`}
                      >
                        <a href={`/api/corporate/invoicing/billing-documents/${doc.id}/download`} download={doc.fileName}>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info card about public link */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">How customers access billing documents</p>
              <p className="text-sm text-muted-foreground">
                The active W-9 is available at{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {publicBaseUrl}/w9/download
                </code>{" "}
                — no login required. A download button is automatically shown on every customer payment page.
                This link can also be included in invoice email templates.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Billing Document</DialogTitle>
            <DialogDescription>
              The new document will immediately become the active version. Any existing active document of the same type will be automatically archived.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bd-type">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="bd-type" data-testid="select-bd-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-display-name">Display Name</Label>
              <Input
                id="bd-display-name"
                placeholder={`e.g., W-9 — ${new Date().getFullYear()}`}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                data-testid="input-bd-display-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-eff-date">Effective Date <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="bd-eff-date"
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                data-testid="input-bd-effective-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-file">File <span className="text-destructive">*</span></Label>
              <div className="flex flex-col gap-2">
                <Input
                  id="bd-file"
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  data-testid="input-bd-file"
                />
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    {selectedFile.name} ({formatBytes(selectedFile.size)})
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PDF, PNG, or JPEG — max 20 MB</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="bd-notes"
                placeholder="e.g., Updated EIN, annual refresh…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                data-testid="textarea-bd-notes"
              />
            </div>

            {docs.some(d => d.documentType === docType && d.status === "active") && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  An active {docTypeLabel(docType)} already exists. It will be automatically archived when you upload this new one.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); resetUploadForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || uploadMutation.isPending}
              data-testid="button-confirm-upload-billing-doc"
            >
              {uploadMutation.isPending ? (
                <>
                  <Upload className="w-4 h-4 mr-2 animate-pulse" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Activate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm Dialog */}
      <Dialog open={!!archiveConfirm} onOpenChange={open => { if (!open) setArchiveConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive Document?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{archiveConfirm?.displayName}</strong> from the public billing portal immediately. The file will remain archived internally.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => archiveConfirm && archiveMutation.mutate(archiveConfirm.id)}
              disabled={archiveMutation.isPending}
              data-testid="button-confirm-archive"
            >
              {archiveMutation.isPending ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
