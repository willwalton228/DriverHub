import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, FileText, Clock, AlertTriangle, CheckCircle2, XCircle,
  Calendar, Loader2, ChevronDown, ChevronRight, FilePlus, Trash2,
  ClipboardList, Shield, Activity, User, Upload, Download, FileWarning,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import type { LeaveCase, LeaveCaseDocument, LeaveCaseEvent } from "@shared/schema";

// ── Constants ────────────────────────────────────────────────────────────────

const LEAVE_TYPES = [
  { value: "cfra",         label: "CFRA" },
  { value: "fmla",         label: "FMLA" },
  { value: "medical",      label: "Medical" },
  { value: "personal",     label: "Personal" },
  { value: "workers_comp", label: "Workers' Comp" },
];

// Keep labels map for display (also handles legacy values)
const LEAVE_TYPE_LABELS: Record<string, string> = {
  cfra:         "CFRA",
  fmla:         "FMLA",
  medical:      "Medical",
  personal:     "Personal",
  workers_comp: "Workers' Comp",
  // Legacy / backwards-compat
  cfra_fmla:    "CFRA + FMLA",
  ada:          "ADA",
  military:     "Military",
  bereavement:  "Bereavement",
  other:        "Other",
};

const STATUS_OPTIONS = [
  { value: "open",     label: "Open" },
  { value: "extended", label: "Extended" },
  { value: "returned", label: "Returned" },
  { value: "closed",   label: "Closed" },
];

const ACTIVE_STATUSES = ["open", "extended"];
const CLOSED_STATUSES = ["returned", "closed"];

const DOC_TYPE_LABELS: Record<string, string> = {
  initial_notice:                "Initial Notice",
  designation_notice:            "Designation Notice",
  medical_certification:         "Medical Certification",
  continuation_certification:    "Continuation Certification",
  return_to_work_clearance:      "Return-to-Work Clearance",
  hr_correspondence:             "HR Correspondence",
  other:                         "Other",
};

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  created:               <Plus className="h-3 w-3 text-muted-foreground" />,
  status_changed:        <Activity className="h-3 w-3 text-muted-foreground" />,
  document_added:        <FilePlus className="h-3 w-3 text-muted-foreground" />,
  document_removed:      <Trash2 className="h-3 w-3 text-muted-foreground" />,
  note_added:            <FileText className="h-3 w-3 text-muted-foreground" />,
  date_updated:          <Calendar className="h-3 w-3 text-muted-foreground" />,
  cert_received:         <CheckCircle2 className="h-3 w-3 text-green-500" />,
  returned:              <Shield className="h-3 w-3 text-blue-500" />,
  closed:                <XCircle className="h-3 w-3 text-muted-foreground" />,
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":     return "default";
    case "extended": return "secondary";
    case "returned": return "outline";
    case "closed":   return "outline";
    default:         return "secondary";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "open":     return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "extended": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "returned": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "closed":   return "bg-muted text-muted-foreground";
    default:         return "bg-muted text-muted-foreground";
  }
}

function leaveBadgeColor(type: string): string {
  switch (type) {
    case "cfra":         return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "fmla":         return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    case "cfra_fmla":    return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
    case "medical":      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "workers_comp": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default:             return "bg-muted text-muted-foreground";
  }
}

interface CorporateUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

// ── New Leave Case Dialog ─────────────────────────────────────────────────────

interface NewCaseDialogProps {
  employeeId: string;
  open: boolean;
  onClose: () => void;
}

function NewCaseDialog({ employeeId, open, onClose }: NewCaseDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    leaveType:          "",
    status:             "open",
    startDate:          "",       // Trigger Date
    expectedReturnDate: "",       // Estimated Release Date
    hrContactId:        "",       // Assigned Owner
    notes:              "",
  });

  const { data: users = [] } = useQuery<CorporateUser[]>({
    queryKey: ["/api/corporate/users"],
    queryFn: () => fetch("/api/corporate/users").then((r) => r.json()),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", `/api/corporate/employees/${employeeId}/leave-cases`, data)
        .then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employeeId, "leave-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases/active"] });
      toast({ title: "Leave case opened" });
      onClose();
      setForm({ leaveType: "", status: "open", startDate: "", expectedReturnDate: "", hrContactId: "", notes: "" });
    },
    onError: () => toast({ title: "Failed to open leave case", variant: "destructive" }),
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  function userName(u: CorporateUser) {
    if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return u.name ?? u.email;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-new-leave-case">
        <DialogHeader>
          <DialogTitle>Open Leave Case</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Leave Type */}
          <div className="space-y-1.5">
            <Label>Leave Type <span className="text-destructive">*</span></Label>
            <Select value={form.leaveType} onValueChange={(v) => set("leaveType", v)}>
              <SelectTrigger data-testid="select-leave-type">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger data-testid="select-leave-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Trigger Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                data-testid="input-trigger-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Release Date</Label>
              <Input
                type="date"
                value={form.expectedReturnDate}
                onChange={(e) => set("expectedReturnDate", e.target.value)}
                data-testid="input-estimated-release-date"
              />
            </div>
          </div>

          {/* Assigned Owner */}
          <div className="space-y-1.5">
            <Label>Assigned Owner</Label>
            <Select value={form.hrContactId} onValueChange={(v) => set("hrContactId", v)}>
              <SelectTrigger data-testid="select-assigned-owner">
                <SelectValue placeholder="Select owner (optional)" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{userName(u)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Initial case notes..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              data-testid="textarea-leave-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-leave-case">Cancel</Button>
          <Button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.leaveType || createMutation.isPending}
            data-testid="button-submit-leave-case"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Open Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Compliance Step Row ───────────────────────────────────────────────────────

interface ComplianceStepProps {
  step: number;
  label: string;
  description: string;
  value: string | null;
  fieldKey: string;
  onSave: (v: string) => void;
  isComplete: boolean;
  isMissing?: boolean;
  isOverdue?: boolean;
  testId: string;
}

function ComplianceStep({ step, label, description, value, onSave, isComplete, isMissing, isOverdue, testId }: ComplianceStepProps) {
  const rowClass = isOverdue
    ? "bg-destructive/5 border-l-2 border-l-destructive"
    : isMissing
    ? "bg-yellow-50/60 dark:bg-yellow-900/10 border-l-2 border-l-yellow-400"
    : "";

  return (
    <div className={`flex items-start gap-4 px-4 py-3 ${rowClass}`} data-testid={`row-compliance-step-${step}`}>
      {/* Step indicator */}
      <div className={`shrink-0 mt-1 flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
        isComplete
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
          : isOverdue
          ? "bg-destructive/20 text-destructive"
          : isMissing
          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
          : "bg-muted text-muted-foreground"
      }`}>
        {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : step}
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{label}</p>
          {isOverdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
          {isMissing && !isOverdue && <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400 dark:text-yellow-400">Missing</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {isComplete && value && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-medium">{formatDate(value)}</p>
        )}
      </div>

      {/* Date input */}
      <div className="shrink-0">
        <Input
          type="date"
          defaultValue={value ?? ""}
          onBlur={(e) => e.target.value && onSave(e.target.value)}
          className="w-38 text-xs"
          data-testid={testId}
        />
      </div>
    </div>
  );
}

// ── Compliance Validation Alerts ──────────────────────────────────────────────

function ComplianceValidationAlerts({ lc }: { lc: LeaveCase }) {
  const today = new Date().toISOString().split("T")[0];
  const warnings: Array<{ severity: "critical" | "warning"; message: string }> = [];

  const d = (v: string | null | undefined) => v ?? null;

  // Cert overdue: due date passed, cert not received
  if (d(lc.certificationDueDate as string) && !d(lc.certificationReceivedDate as string) && (lc.certificationDueDate as string) < today) {
    warnings.push({ severity: "critical", message: `Medical certification was due ${formatDate(lc.certificationDueDate as string)} — not yet received.` });
  }

  // Designation notice missing after cert received
  if (d(lc.certificationReceivedDate as string) && !d(lc.designationNoticeSentDate as string)) {
    warnings.push({ severity: "warning", message: "Certification received but Designation Notice has not been sent." });
  }

  // Notice of Rights missing after trigger date
  if (d(lc.startDate as string) && !d(lc.noticeOfRightsSentDate as string)) {
    warnings.push({ severity: "warning", message: "Leave triggered but Notice of Rights has not been sent to employee." });
  }

  // Cert received before it was requested (illogical sequence)
  if (d(lc.certificationReceivedDate as string) && d(lc.medicalCertRequestedDate as string) &&
      (lc.certificationReceivedDate as string) < (lc.medicalCertRequestedDate as string)) {
    warnings.push({ severity: "critical", message: "Medical certification received date is before the request date — please verify." });
  }

  // Designation sent before cert received (illogical)
  if (d(lc.designationNoticeSentDate as string) && d(lc.certificationReceivedDate as string) &&
      (lc.designationNoticeSentDate as string) < (lc.certificationReceivedDate as string)) {
    warnings.push({ severity: "critical", message: "Designation Notice sent date is before certification received date — please verify." });
  }

  // Actual return before trigger date
  if (d(lc.actualReturnDate as string) && d(lc.startDate as string) &&
      (lc.actualReturnDate as string) < (lc.startDate as string)) {
    warnings.push({ severity: "critical", message: "Actual return to work date is before the CFRA trigger date — please verify." });
  }

  // Estimated release before trigger date
  if (d(lc.expectedReturnDate as string) && d(lc.startDate as string) &&
      (lc.expectedReturnDate as string) < (lc.startDate as string)) {
    warnings.push({ severity: "warning", message: "Estimated release date is before the trigger date — please verify." });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="section-compliance-alerts">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md text-sm border ${
            w.severity === "critical"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/10 dark:border-yellow-800/30 dark:text-yellow-300"
          }`}
          data-testid={`alert-compliance-${i}`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{w.message}</p>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(mime: string | null): React.ReactNode {
  if (!mime) return <FileText className="h-4 w-4 text-muted-foreground" />;
  if (mime.startsWith("image/")) return <FileText className="h-4 w-4 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

// ── Primary Document Slots ────────────────────────────────────────────────────
// These three are the "required" documents for any CFRA/FMLA case.

const PRIMARY_DOC_TYPES = [
  { value: "notice_of_rights",      label: "Notice of Rights",    description: "Sent to employee within 5 business days of leave trigger" },
  { value: "medical_certification", label: "Medical Certification", description: "Completed by employee's healthcare provider" },
  { value: "designation_notice",    label: "Designation Notice",   description: "Sent to employee within 5 business days of receiving certification" },
];

// ── DocumentsTab Component ────────────────────────────────────────────────────

interface DocumentsTabProps {
  lc: LeaveCase;
  employeeId: string;
  docs: LeaveCaseDocument[];
  docsLoading: boolean;
  docsRefetch: () => void;
  eventsRefetch: () => void;
}

function DocumentsTab({ lc, employeeId, docs, docsLoading, docsRefetch, eventsRefetch }: DocumentsTabProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docForm, setDocForm] = useState({
    documentType: "", documentName: "", notes: "", dueDate: "", isMissing: false,
  });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Upload with file
  const uploadMutation = useMutation({
    mutationFn: async (form: typeof docForm & { file: File }) => {
      const fd = new FormData();
      fd.append("file", form.file);
      fd.append("documentType", form.documentType);
      fd.append("documentName", form.documentName);
      fd.append("employeeId", employeeId);
      if (form.notes)   fd.append("notes", form.notes);
      if (form.dueDate) fd.append("dueDate", form.dueDate);
      const res = await fetch(`/api/corporate/leave-cases/${lc.id}/documents/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      docsRefetch();
      eventsRefetch();
      setUploadDialogOpen(false);
      setPendingFile(null);
      setDocForm({ documentType: "", documentName: "", notes: "", dueDate: "", isMissing: false });
      toast({ title: "Document uploaded" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  // Log metadata only (no file)
  const metaMutation = useMutation({
    mutationFn: (data: typeof docForm) =>
      apiRequest("POST", `/api/corporate/leave-cases/${lc.id}/documents`, { ...data, employeeId })
        .then((r) => r.json()),
    onSuccess: () => {
      docsRefetch();
      eventsRefetch();
      setMetaDialogOpen(false);
      setDocForm({ documentType: "", documentName: "", notes: "", dueDate: "", isMissing: false });
      toast({ title: "Document logged" });
    },
    onError: () => toast({ title: "Failed to log document", variant: "destructive" }),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      apiRequest("DELETE", `/api/corporate/leave-cases/${lc.id}/documents/${docId}`),
    onSuccess: () => { docsRefetch(); eventsRefetch(); },
    onError: () => toast({ title: "Failed to remove document", variant: "destructive" }),
  });

  // Get signed URL and open
  async function viewDocument(doc: LeaveCaseDocument) {
    if (!doc.storageKey) return;
    setDownloadingId(doc.id);
    try {
      const res = await fetch(`/api/corporate/leave-cases/${lc.id}/documents/${doc.id}/url`, { credentials: "include" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else toast({ title: "Could not generate download link", variant: "destructive" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    setDocForm((p) => ({ ...p, documentName: p.documentName || f.name.replace(/\.[^.]+$/, "") }));
    setUploadDialogOpen(true);
  }

  // Map doc type → uploaded docs for primary slot lookup
  const primaryDocsByType = PRIMARY_DOC_TYPES.reduce<Record<string, LeaveCaseDocument[]>>((acc, t) => {
    acc[t.value] = docs.filter((d) => d.documentType === t.value);
    return acc;
  }, {});
  const otherDocs = docs.filter((d) => !PRIMARY_DOC_TYPES.some((p) => p.value === d.documentType));
  const missingCount = docs.filter((d) => d.isMissing).length;

  return (
    <div className="space-y-5" data-testid="section-documents">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Leave Documents</p>
          {missingCount > 0 && (
            <Badge variant="destructive" className="text-xs" data-testid="badge-missing-docs">
              <FileWarning className="h-3 w-3 mr-1" />
              {missingCount} missing
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMetaDialogOpen(true)} data-testid="button-log-document">
            <FilePlus className="h-3.5 w-3.5 mr-1.5" />
            Log Entry
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-document">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Upload File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="hidden"
            onChange={onFileSelected}
            data-testid="input-file-upload"
          />
        </div>
      </div>

      {/* Primary Document Slots */}
      <div className="border rounded-md divide-y">
        <div className="px-4 py-2.5 bg-muted/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required Documents</p>
        </div>
        {PRIMARY_DOC_TYPES.map((pt) => {
          const uploaded = primaryDocsByType[pt.value] ?? [];
          const hasFile = uploaded.some((d) => !!d.storageKey);
          const isMissing = uploaded.some((d) => d.isMissing);
          return (
            <div key={pt.value} className="flex items-start gap-4 px-4 py-3" data-testid={`slot-${pt.value}`}>
              <div className={`shrink-0 mt-1 w-6 h-6 rounded-full flex items-center justify-center ${
                hasFile ? "bg-green-100 dark:bg-green-900/40" : isMissing ? "bg-destructive/20" : "bg-muted"
              }`}>
                {hasFile
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                  : isMissing
                  ? <FileWarning className="h-3.5 w-3.5 text-destructive" />
                  : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{pt.label}</p>
                  {hasFile && <Badge variant="outline" className="text-xs text-green-700 border-green-400 dark:text-green-400">Uploaded</Badge>}
                  {isMissing && !hasFile && <Badge variant="destructive" className="text-xs">Missing</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{pt.description}</p>
                {/* Uploaded files for this type */}
                {uploaded.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploaded.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-xs" data-testid={`doc-${doc.id}`}>
                        {mimeIcon(doc.mimeType ?? null)}
                        <span className="truncate text-muted-foreground">{doc.documentName}</span>
                        {doc.fileSizeBytes && <span className="text-muted-foreground shrink-0">· {formatFileSize(doc.fileSizeBytes)}</span>}
                        <span className="text-muted-foreground shrink-0">
                          · {doc.uploadedAt ? new Date(doc.uploadedAt as string).toLocaleDateString() : doc.createdAt ? new Date(doc.createdAt as string).toLocaleDateString() : ""}
                        </span>
                        {doc.storageKey && (
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => viewDocument(doc)} disabled={downloadingId === doc.id} data-testid={`button-view-${doc.id}`}>
                            {downloadingId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => deleteMutation.mutate(doc.id)} data-testid={`button-delete-${doc.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Quick upload button per slot */}
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs"
                onClick={() => {
                  setDocForm((p) => ({ ...p, documentType: pt.value, documentName: `${pt.label} ${new Date().getFullYear()}` }));
                  fileInputRef.current?.click();
                }}
                data-testid={`button-upload-${pt.value}`}
              >
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </Button>
            </div>
          );
        })}
      </div>

      {/* All Other Documents */}
      {(docsLoading || otherDocs.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Other Documents</p>
          {docsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {otherDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-md text-sm" data-testid={`row-document-${doc.id}`}>
                  {mimeIcon(doc.mimeType ?? null)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.documentName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                      {doc.fileSizeBytes && <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSizeBytes)}</span>}
                      {(doc.uploadedAt || doc.createdAt) && (
                        <span className="text-xs text-muted-foreground">
                          Logged {new Date((doc.uploadedAt ?? doc.createdAt) as string).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {doc.notes && <p className="text-xs text-muted-foreground mt-0.5">{doc.notes}</p>}
                  </div>
                  {doc.isMissing && <Badge variant="destructive" className="text-xs shrink-0">Missing</Badge>}
                  {doc.storageKey && (
                    <Button size="icon" variant="ghost" onClick={() => viewDocument(doc)} disabled={downloadingId === doc.id} data-testid={`button-view-${doc.id}`}>
                      {downloadingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(doc.id)} data-testid={`button-delete-doc-${doc.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!docsLoading && docs.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm border rounded-md" data-testid="text-no-documents">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No documents on this case yet
        </div>
      )}

      {/* Upload File Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(o) => { if (!o) { setUploadDialogOpen(false); setPendingFile(null); } }}>
        <DialogContent data-testid="dialog-upload-document">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            {pendingFile && (
              <p className="text-sm text-muted-foreground">{pendingFile.name} · {formatFileSize(pendingFile.size)}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document Type <span className="text-destructive">*</span></Label>
              <Select value={docForm.documentType} onValueChange={(v) => setDocForm((p) => ({ ...p, documentType: v }))}>
                <SelectTrigger data-testid="select-upload-doc-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document Name <span className="text-destructive">*</span></Label>
              <Input
                value={docForm.documentName}
                onChange={(e) => setDocForm((p) => ({ ...p, documentName: e.target.value }))}
                placeholder="e.g. CFRA Notice of Rights Mar 2025"
                data-testid="input-upload-doc-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} data-testid="textarea-upload-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setPendingFile(null); }}>Cancel</Button>
            <Button
              onClick={() => pendingFile && uploadMutation.mutate({ ...docForm, file: pendingFile })}
              disabled={!docForm.documentType || !docForm.documentName || !pendingFile || uploadMutation.isPending}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Metadata Only Dialog */}
      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent data-testid="dialog-log-document">
          <DialogHeader><DialogTitle>Log Document Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document Type <span className="text-destructive">*</span></Label>
              <Select value={docForm.documentType} onValueChange={(v) => setDocForm((p) => ({ ...p, documentType: v }))}>
                <SelectTrigger data-testid="select-meta-doc-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document Name <span className="text-destructive">*</span></Label>
              <Input value={docForm.documentName} onChange={(e) => setDocForm((p) => ({ ...p, documentName: e.target.value }))} placeholder="e.g. CFRA Designation Notice 2025" data-testid="input-meta-doc-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={docForm.dueDate} onChange={(e) => setDocForm((p) => ({ ...p, dueDate: e.target.value }))} data-testid="input-meta-due-date" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="meta-missing" checked={docForm.isMissing} onChange={(e) => setDocForm((p) => ({ ...p, isMissing: e.target.checked }))} data-testid="checkbox-meta-missing" />
              <Label htmlFor="meta-missing">Flag as missing / not yet received</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} data-testid="textarea-meta-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => metaMutation.mutate(docForm)} disabled={!docForm.documentType || !docForm.documentName || metaMutation.isPending} data-testid="button-save-meta">
              {metaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Leave Case Detail Panel ───────────────────────────────────────────────────

interface CaseDetailPanelProps {
  lc: LeaveCase;
  employeeId: string;
}

function CaseDetailPanel({ lc, employeeId }: CaseDetailPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [noteText, setNoteText] = useState("");

  const { data: users = [] } = useQuery<CorporateUser[]>({
    queryKey: ["/api/corporate/users"],
    queryFn: () => fetch("/api/corporate/users").then((r) => r.json()),
  });

  const docs = useQuery<LeaveCaseDocument[]>({
    queryKey: ["/api/corporate/leave-cases", lc.id, "documents"],
    queryFn: () => fetch(`/api/corporate/leave-cases/${lc.id}/documents`).then((r) => r.json()),
  });

  const events = useQuery<LeaveCaseEvent[]>({
    queryKey: ["/api/corporate/leave-cases", lc.id, "events"],
    queryFn: () => fetch(`/api/corporate/leave-cases/${lc.id}/events`).then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<LeaveCase>) =>
      apiRequest("PATCH", `/api/corporate/leave-cases/${lc.id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/employees", employeeId, "leave-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases", lc.id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases/active"] });
      toast({ title: "Case updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) =>
      apiRequest("POST", `/api/corporate/leave-cases/${lc.id}/note`, { note }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases", lc.id, "events"] });
      setNoteText("");
      toast({ title: "Note added" });
    },
  });

  const today = new Date().toISOString().split("T")[0];
  const certDue = lc.certificationDueDate as string | null;
  const soonDate = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split("T")[0]; })();
  const certOverdue = certDue && !lc.certificationReceivedDate && certDue < today;
  const certDueSoon = certDue && !lc.certificationReceivedDate && certDue >= today && certDue <= soonDate;

  function ownerName(): string {
    if (!lc.hrContactId) return "—";
    const u = users.find((u) => u.id === lc.hrContactId);
    if (!u) return "—";
    if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return u.name ?? u.email;
  }

  function userName(u: CorporateUser) {
    if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return u.name ?? u.email;
  }

  return (
    <div className="border rounded-md mt-2" data-testid={`panel-leave-case-${lc.id}`}>
      {/* Case header with status + quick controls */}
      <div className="flex items-center gap-3 p-3 border-b flex-wrap">
        <span className="text-xs font-mono font-medium text-muted-foreground">{lc.caseNumber}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leaveBadgeColor(lc.leaveType)}`}>
          {LEAVE_TYPE_LABELS[lc.leaveType] ?? lc.leaveType}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={lc.status}
            onValueChange={(v) => updateMutation.mutate({ status: v })}
          >
            <SelectTrigger className="h-8 text-xs w-36" data-testid={`select-case-status-${lc.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overdue cert alert */}
      {(certOverdue || certDueSoon) && (
        <div className={`flex items-center gap-2 px-3 py-2 text-sm border-b ${certOverdue ? "bg-destructive/10 text-destructive" : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {certOverdue
            ? `Medical certification was due ${certDue} — overdue`
            : `Medical certification due ${certDue}`}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-3">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" data-testid="tab-leave-overview">Overview</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-leave-documents">
            Documents
            {docs.data && docs.data.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{docs.data.length}</Badge>
            )}
            {docs.data && docs.data.some((d) => d.isMissing) && (
              <Badge variant="destructive" className="ml-1 text-xs">{docs.data.filter((d) => d.isMissing).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="eligibility" data-testid="tab-leave-eligibility">CFRA / FMLA</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-leave-timeline">Audit Trail</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          {/* Key fields summary */}
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Trigger Date</p>
              <p className="font-medium">{lc.startDate ? formatDate(lc.startDate as string) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated Release Date</p>
              <p className="font-medium">{lc.expectedReturnDate ? formatDate(lc.expectedReturnDate as string) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actual Return Date</p>
              <p className={`font-medium ${!lc.actualReturnDate ? "text-muted-foreground" : ""}`}>
                {lc.actualReturnDate ? formatDate(lc.actualReturnDate as string) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned Owner</p>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-medium">{ownerName()}</p>
              </div>
            </div>
          </div>

          {/* Inline edit for dates */}
          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Update Dates</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Trigger Date</Label>
                <Input
                  type="date"
                  defaultValue={(lc.startDate as string) ?? ""}
                  onBlur={(e) => e.target.value !== lc.startDate && updateMutation.mutate({ startDate: e.target.value })}
                  data-testid={`input-trigger-date-${lc.id}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estimated Release Date</Label>
                <Input
                  type="date"
                  defaultValue={(lc.expectedReturnDate as string) ?? ""}
                  onBlur={(e) => e.target.value !== lc.expectedReturnDate && updateMutation.mutate({ expectedReturnDate: e.target.value })}
                  data-testid={`input-release-date-${lc.id}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Actual Return Date</Label>
                <Input
                  type="date"
                  defaultValue={(lc.actualReturnDate as string) ?? ""}
                  onBlur={(e) => e.target.value !== lc.actualReturnDate && updateMutation.mutate({ actualReturnDate: e.target.value })}
                  data-testid={`input-return-date-${lc.id}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assigned Owner</Label>
                <Select
                  value={lc.hrContactId ?? ""}
                  onValueChange={(v) => updateMutation.mutate({ hrContactId: v })}
                >
                  <SelectTrigger data-testid={`select-owner-${lc.id}`}>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{userName(u)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="border-t pt-3 flex flex-wrap gap-2">
            {lc.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "extended" })} data-testid="button-mark-extended">
                Mark as Extended
              </Button>
            )}
            {(lc.status === "open" || lc.status === "extended") && (
              <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "returned", actualReturnDate: today })} data-testid="button-mark-returned">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Mark Returned
              </Button>
            )}
            {lc.status === "returned" && (
              <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ status: "closed" })} data-testid="button-mark-closed">
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Close Case
              </Button>
            )}
          </div>

          {/* Notes section */}
          {lc.notes && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{lc.notes}</p>
            </div>
          )}
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents" className="space-y-4">
          <DocumentsTab lc={lc} employeeId={employeeId} docs={docs.data ?? []} docsLoading={docs.isLoading} docsRefetch={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases", lc.id, "documents"] })} eventsRefetch={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases", lc.id, "events"] })} />
        </TabsContent>

        {/* ── CFRA / FMLA Eligibility Tab ── */}
        <TabsContent value="eligibility" className="space-y-5">
          {/* ── Validation Warnings ── */}
          <ComplianceValidationAlerts lc={lc} />

          {/* ── 8-Step Compliance Workflow ── */}
          <div className="border rounded-md divide-y">
            <div className="px-4 py-3 bg-muted/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CFRA / FMLA Compliance Workflow</p>
              <p className="text-xs text-muted-foreground mt-0.5">Complete each step in sequence. Fields in red indicate missing or overdue data.</p>
            </div>

            {/* Step 1 — Trigger Date */}
            <ComplianceStep
              step={1}
              label="CFRA Trigger Date"
              description="Date leave begins — employer has 5 business days to send Notice of Rights"
              value={lc.startDate as string | null}
              fieldKey="startDate"
              onSave={(v) => updateMutation.mutate({ startDate: v })}
              isComplete={!!lc.startDate}
              testId="input-compliance-trigger-date"
            />

            {/* Step 2 — Notice of Rights Sent */}
            <ComplianceStep
              step={2}
              label="Notice of Rights Sent"
              description="Date employer sent CFRA/FMLA Notice of Rights to employee (required within 5 business days of trigger)"
              value={lc.noticeOfRightsSentDate as string | null}
              fieldKey="noticeOfRightsSentDate"
              onSave={(v) => updateMutation.mutate({ noticeOfRightsSentDate: v })}
              isComplete={!!lc.noticeOfRightsSentDate}
              isMissing={!!lc.startDate && !lc.noticeOfRightsSentDate}
              testId="input-compliance-notice-rights-sent"
            />

            {/* Step 3 — Medical Cert Requested */}
            <ComplianceStep
              step={3}
              label="Medical Certification Requested"
              description="Date employer requested medical certification from employee's healthcare provider"
              value={lc.medicalCertRequestedDate as string | null}
              fieldKey="medicalCertRequestedDate"
              onSave={(v) => updateMutation.mutate({ medicalCertRequestedDate: v })}
              isComplete={!!lc.medicalCertRequestedDate}
              testId="input-compliance-cert-requested"
            />

            {/* Step 4 — Cert Due Date */}
            <ComplianceStep
              step={4}
              label="Medical Certification Due"
              description="Deadline for employee to return medical certification (typically 15 days from request date)"
              value={lc.certificationDueDate as string | null}
              fieldKey="certificationDueDate"
              onSave={(v) => updateMutation.mutate({ certificationDueDate: v })}
              isComplete={!!lc.certificationDueDate}
              isOverdue={!!lc.certificationDueDate && !lc.certificationReceivedDate && (lc.certificationDueDate as string) < new Date().toISOString().split("T")[0]}
              testId="input-compliance-cert-due"
            />

            {/* Step 5 — Cert Received */}
            <ComplianceStep
              step={5}
              label="Medical Certification Received"
              description="Date medical certification was received from healthcare provider"
              value={lc.certificationReceivedDate as string | null}
              fieldKey="certificationReceivedDate"
              onSave={(v) => updateMutation.mutate({ certificationReceivedDate: v })}
              isComplete={!!lc.certificationReceivedDate}
              isMissing={!!lc.certificationDueDate && !lc.certificationReceivedDate}
              testId="input-compliance-cert-received"
            />

            {/* Step 6 — Designation Notice Sent */}
            <ComplianceStep
              step={6}
              label="Designation Notice Sent"
              description="Date employer sent designation notice to employee (required within 5 business days of receiving certification)"
              value={lc.designationNoticeSentDate as string | null}
              fieldKey="designationNoticeSentDate"
              onSave={(v) => updateMutation.mutate({ designationNoticeSentDate: v })}
              isComplete={!!lc.designationNoticeSentDate}
              isMissing={!!lc.certificationReceivedDate && !lc.designationNoticeSentDate}
              testId="input-compliance-designation-sent"
            />

            {/* Step 7 — Estimated Release Date */}
            <ComplianceStep
              step={7}
              label="Estimated Release Date"
              description="Expected date employee will return to work"
              value={lc.expectedReturnDate as string | null}
              fieldKey="expectedReturnDate"
              onSave={(v) => updateMutation.mutate({ expectedReturnDate: v })}
              isComplete={!!lc.expectedReturnDate}
              testId="input-compliance-estimated-release"
            />

            {/* Step 8 — Actual Return to Work */}
            <ComplianceStep
              step={8}
              label="Actual Return to Work"
              description="Date employee actually returned to work"
              value={lc.actualReturnDate as string | null}
              fieldKey="actualReturnDate"
              onSave={(v) => updateMutation.mutate({ actualReturnDate: v })}
              isComplete={!!lc.actualReturnDate}
              testId="input-compliance-actual-return"
            />
          </div>

          {/* ── Eligibility quick-check ── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border rounded-md p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-medium">CFRA Eligibility</p>
                {lc.cfraEligible === true  && <Badge variant="default"     className="text-xs">Eligible</Badge>}
                {lc.cfraEligible === false && <Badge variant="destructive" className="text-xs">Not Eligible</Badge>}
                {lc.cfraEligible == null   && <Badge variant="outline"     className="text-xs">Unknown</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">CA employers ≥5 employees · 12 months + 1,250 hrs</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Hours Worked</Label>
                  <Input type="number" defaultValue={lc.cfraHoursWorked ?? ""} onBlur={(e) => updateMutation.mutate({ cfraHoursWorked: parseInt(e.target.value) })} placeholder="e.g. 1250" data-testid="input-cfra-hours" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Months Employed</Label>
                  <Input type="number" defaultValue={lc.cfraMonthsEmployed ?? ""} onBlur={(e) => updateMutation.mutate({ cfraMonthsEmployed: parseInt(e.target.value) })} placeholder="e.g. 12" data-testid="input-cfra-months" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={lc.cfraEligible === true ? "default" : "outline"} onClick={() => updateMutation.mutate({ cfraEligible: true })} data-testid="button-cfra-eligible">Eligible</Button>
                <Button size="sm" variant={lc.cfraEligible === false ? "destructive" : "outline"} onClick={() => updateMutation.mutate({ cfraEligible: false })} data-testid="button-cfra-not-eligible">Not Eligible</Button>
              </div>
            </div>

            <div className="border rounded-md p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield className="h-4 w-4 text-purple-500" />
                <p className="text-sm font-medium">FMLA Eligibility</p>
                {lc.fmlaEligible === true  && <Badge variant="default"     className="text-xs">Eligible</Badge>}
                {lc.fmlaEligible === false && <Badge variant="destructive" className="text-xs">Not Eligible</Badge>}
                {lc.fmlaEligible == null   && <Badge variant="outline"     className="text-xs">Unknown</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">Employers ≥50 employees · 12 months + 1,250 hrs</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Hours Worked</Label>
                  <Input type="number" defaultValue={lc.fmlaHoursWorked ?? ""} onBlur={(e) => updateMutation.mutate({ fmlaHoursWorked: parseInt(e.target.value) })} placeholder="e.g. 1250" data-testid="input-fmla-hours" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Months Employed</Label>
                  <Input type="number" defaultValue={lc.fmlaMonthsEmployed ?? ""} onBlur={(e) => updateMutation.mutate({ fmlaMonthsEmployed: parseInt(e.target.value) })} placeholder="e.g. 12" data-testid="input-fmla-months" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={lc.fmlaEligible === true ? "default" : "outline"} onClick={() => updateMutation.mutate({ fmlaEligible: true })} data-testid="button-fmla-eligible">Eligible</Button>
                <Button size="sm" variant={lc.fmlaEligible === false ? "destructive" : "outline"} onClick={() => updateMutation.mutate({ fmlaEligible: false })} data-testid="button-fmla-not-eligible">Not Eligible</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Audit Trail Tab ── */}
        <TabsContent value="timeline" className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Add Note to Audit Trail</Label>
            <div className="flex gap-2">
              <Textarea
                placeholder="Enter a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1 min-h-[72px]"
                data-testid="textarea-add-note"
              />
              <Button
                size="sm"
                onClick={() => addNoteMutation.mutate(noteText)}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                className="self-end"
                data-testid="button-save-note"
              >
                {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>

          <div className="border-t pt-3">
            {events.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : events.data && events.data.length > 0 ? (
              <div className="space-y-3">
                {events.data.map((ev) => (
                  <div key={ev.id} className="flex gap-2.5 text-sm" data-testid={`row-event-${ev.id}`}>
                    <div className="mt-1 shrink-0">
                      {EVENT_TYPE_ICONS[ev.eventType] ?? <Clock className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p>{ev.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.performedByName ?? "System"} · {new Date(ev.createdAt as string).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No events recorded yet</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Main Leave Management Component ──────────────────────────────────────────

interface EmployeeLeaveManagementProps {
  employeeId: string;
}

export function EmployeeLeaveManagement({ employeeId }: EmployeeLeaveManagementProps) {
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  const { data: cases, isLoading } = useQuery<LeaveCase[]>({
    queryKey: ["/api/corporate/employees", employeeId, "leave-cases"],
    queryFn: () => fetch(`/api/corporate/employees/${employeeId}/leave-cases`).then((r) => r.json()),
  });

  const active = cases?.filter((c) => ACTIVE_STATUSES.includes(c.status)) ?? [];
  const historical = cases?.filter((c) => !ACTIVE_STATUSES.includes(c.status)) ?? [];

  return (
    <Card id="leave-management-section" data-testid="card-leave-management">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Leave Management</CardTitle>
          {active.length > 0 && (
            <Badge variant="secondary" data-testid="badge-active-cases-count">
              {active.length} active
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setNewCaseOpen(true)} data-testid="button-open-leave-case">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Open Leave Case
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !cases || cases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-leave-cases">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No leave cases on record</p>
          </div>
        ) : (
          <>
            {/* Active cases */}
            {active.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Active</p>
                {active.map((lc) => (
                  <div key={lc.id}>
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate text-left"
                      onClick={() => setExpandedCaseId(expandedCaseId === lc.id ? null : lc.id)}
                      data-testid={`button-expand-case-${lc.id}`}
                    >
                      {expandedCaseId === lc.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <span className="text-xs font-mono text-muted-foreground">{lc.caseNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leaveBadgeColor(lc.leaveType)}`}>
                        {LEAVE_TYPE_LABELS[lc.leaveType] ?? lc.leaveType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(lc.status)}`}>
                        {STATUS_OPTIONS.find((s) => s.value === lc.status)?.label ?? lc.status}
                      </span>
                      {lc.startDate && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          Triggered {formatDate(lc.startDate as string)}
                        </span>
                      )}
                      {lc.expectedReturnDate && (
                        <span className="text-xs text-muted-foreground">
                          Est. release {formatDate(lc.expectedReturnDate as string)}
                        </span>
                      )}
                    </button>
                    {expandedCaseId === lc.id && (
                      <CaseDetailPanel lc={lc} employeeId={employeeId} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Historical cases */}
            {historical.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">History</p>
                {historical.map((lc) => (
                  <div key={lc.id}>
                    <button
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate text-left opacity-70"
                      onClick={() => setExpandedCaseId(expandedCaseId === lc.id ? null : lc.id)}
                      data-testid={`button-expand-case-${lc.id}`}
                    >
                      {expandedCaseId === lc.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <span className="text-xs font-mono text-muted-foreground">{lc.caseNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leaveBadgeColor(lc.leaveType)}`}>
                        {LEAVE_TYPE_LABELS[lc.leaveType] ?? lc.leaveType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(lc.status)}`}>
                        {STATUS_OPTIONS.find((s) => s.value === lc.status)?.label ?? lc.status}
                      </span>
                      {lc.actualReturnDate ? (
                        <span className="text-xs text-muted-foreground ml-auto">
                          Returned {formatDate(lc.actualReturnDate as string)}
                        </span>
                      ) : (
                        <span className="ml-auto" />
                      )}
                    </button>
                    {expandedCaseId === lc.id && (
                      <CaseDetailPanel lc={lc} employeeId={employeeId} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <NewCaseDialog employeeId={employeeId} open={newCaseOpen} onClose={() => setNewCaseOpen(false)} />
    </Card>
  );
}
