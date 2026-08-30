import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText, Pencil, Save, CheckCircle2, Eye, EyeOff, Loader2,
  ChevronDown, ChevronUp, Plus, Trash2, Tag, AlertTriangle, Info,
} from "lucide-react";
import { format } from "date-fns";

// ── Available placeholder tokens for the template editor ──────────────────────
const PLACEHOLDERS = [
  { key: "{{pay_rate}}",                label: "Pay Rate" },
  { key: "{{location}}",               label: "Location / Address" },
  { key: "{{market}}",                 label: "Market" },
  { key: "{{dealership}}",             label: "Dealership" },
  { key: "{{address}}",               label: "Full Address" },
  { key: "{{driver_types}}",           label: "Driver Types" },
  { key: "{{target_date}}",            label: "Target Fill Date" },
  { key: "{{target_count}}",           label: "Target Driver Count" },
  { key: "{{schedule}}",               label: "Schedule Type" },
  { key: "{{sign_on_bonus}}",          label: "Sign-On Bonus" },
];

const DRIVER_TYPE_OPTIONS = ["Shift", "On-Demand", "Shuttle", "CDL"];
const ROLE_TYPE_OPTIONS = [
  { value: "any",       label: "Any / Universal" },
  { value: "shift",     label: "Shift Driver" },
  { value: "on_demand", label: "On-Demand Driver" },
  { value: "shuttle",   label: "Shuttle Driver" },
  { value: "cdl",       label: "CDL Driver" },
];

const ADMIN_ROLES = ["admin", "super_user", "corporate_admin"];
const RECRUITER_ROLES = ["admin", "super_user", "corporate_admin", "manager", "recruiter", "recruiting_admin"];

// ── Status badge ──────────────────────────────────────────────────────────────

function DraftStatusBadge({ status }: { status: string }) {
  const cfg = {
    draft:     { label: "Draft",     className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
    finalized: { label: "Finalized", className: "bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300" },
    posted:    { label: "Posted",    className: "bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300" },
  }[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Template Manager (admin only) ─────────────────────────────────────────────

export function JobAdTemplateManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ADMIN_ROLES.includes((user as any)?.role || "");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [showBody, setShowBody] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", driverTypes: [] as string[], roleType: "any",
    templateBody: "", description: "", isDefault: false,
  });

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/job-ad-templates"],
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? apiRequest("PATCH", `/api/recruiting/job-ad-templates/${editing.id}`, payload)
        : apiRequest("POST", "/api/recruiting/job-ad-templates", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/job-ad-templates"] });
      setDialogOpen(false);
      setEditing(null);
      toast({ title: editing ? "Template updated" : "Template created" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recruiting/job-ad-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/job-ad-templates"] });
      toast({ title: "Template archived" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", driverTypes: [], roleType: "any", templateBody: "", description: "", isDefault: false });
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name, driverTypes: t.driverTypes || [], roleType: t.roleType || "any",
      templateBody: t.templateBody, description: t.description || "", isDefault: t.isDefault,
    });
    setDialogOpen(true);
  };

  const toggleDriverType = (dt: string) =>
    setForm(f => ({
      ...f,
      driverTypes: f.driverTypes.includes(dt)
        ? f.driverTypes.filter(d => d !== dt)
        : [...f.driverTypes, dt],
    }));

  const insertPlaceholder = (key: string) =>
    setForm(f => ({ ...f, templateBody: f.templateBody + key }));

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Job Ad Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admin-managed templates with <code className="bg-muted px-1 rounded text-xs">&#123;&#123;placeholder&#125;&#125;</code> variables auto-filled from campaign data.
          </p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="btn-new-job-ad-template">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
            <FileText className="h-8 w-8" />
            <p className="text-sm">No templates yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.name}</span>
                      {t.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {ROLE_TYPE_OPTIONS.find(r => r.value === t.roleType)?.label || "Any role"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(t.driverTypes || []).map((dt: string) => (
                        <span key={dt} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
                          <Tag className="h-2.5 w-2.5" />{dt}
                        </span>
                      ))}
                      {(!t.driverTypes || t.driverTypes.length === 0) && (
                        <span className="text-xs text-muted-foreground">All driver types</span>
                      )}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setShowBody(showBody === t.id ? null : t.id)} title="Preview template">
                      {showBody === t.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)} data-testid={`btn-edit-template-${t.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)} data-testid={`btn-delete-template-${t.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {showBody === t.id && (
                  <div className="mt-3 rounded-md bg-muted/60 border border-border p-3 text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                    {t.templateBody}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Job Ad Template"}</DialogTitle>
            <DialogDescription>
              Use <code className="bg-muted px-1 rounded">&#123;&#123;placeholder&#125;&#125;</code> variables to auto-fill campaign data when a recruiter selects this template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Template Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Standard Shift Driver Ad"
                data-testid="input-template-name"
              />
            </div>

            {/* Role type + driver types */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role Type</Label>
                <Select value={form.roleType} onValueChange={v => setForm(f => ({ ...f, roleType: v }))}>
                  <SelectTrigger data-testid="select-role-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_TYPE_OPTIONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Driver Types (tags)</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DRIVER_TYPE_OPTIONS.map(dt => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => toggleDriverType(dt)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        form.driverTypes.includes(dt)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover-elevate"
                      }`}
                      data-testid={`btn-driver-type-${dt}`}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Placeholder quick-insert */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Insert placeholder
              </Label>
              <div className="flex flex-wrap gap-1">
                {PLACEHOLDERS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.key)}
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground hover-elevate font-mono"
                  >
                    {p.key}
                  </button>
                ))}
              </div>
            </div>

            {/* Template body */}
            <div className="space-y-1.5">
              <Label>Template Body <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.templateBody}
                onChange={e => setForm(f => ({ ...f, templateBody: e.target.value }))}
                placeholder={`We're Hiring {{driver_types}} Drivers!\n\nLocation: {{location}}\nPay: {{pay_rate}}\nSchedule: {{schedule}}\n{{sign_on_bonus}}\n\nApply today!`}
                className="min-h-[180px] font-mono text-xs"
                data-testid="textarea-template-body"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Internal Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short note for recruiters"
                data-testid="input-template-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.name.trim() || !form.templateBody.trim()}
              data-testid="btn-save-template"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {editing ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Job Ad Panel (recruiter view, embedded in RequisitionDetailView) ───────────

interface JobAdPanelProps {
  requisitionId: string;
  requisition: any;
}

export function JobAdPanel({ requisitionId, requisition }: JobAdPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isRecruiter = RECRUITER_ROLES.includes((user as any)?.role || "");

  // Current saved draft
  const { data: draft, isLoading: draftLoading } = useQuery<any>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "job-ad-draft"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/job-ad-draft`, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    },
  });

  // Available templates
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/job-ad-templates"],
  });

  // Component state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editorBody, setEditorBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [populated, setPopulated] = useState("");
  const [populatingId, setPopulatingId] = useState<string | null>(null);

  // When draft loads, seed the editor
  useEffect(() => {
    if (draft?.draftBody && !isEditing) {
      setEditorBody(draft.draftBody);
      setSelectedTemplateId(draft.templateId || "");
    }
  }, [draft]);

  // Auto-populate when a template is selected
  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    setPopulatingId(templateId);
    try {
      const res = await fetch(`/api/recruiting/job-ad-templates/${templateId}/preview?requisitionId=${requisitionId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEditorBody(data.populated || data.templateBody || "");
        setIsEditing(true);
      }
    } catch {
      toast({ title: "Failed to load template", variant: "destructive" });
    } finally {
      setPopulatingId(null);
    }
  };

  // Save draft mutation
  const saveMutation = useMutation({
    mutationFn: (payload: { draftBody: string; templateId?: string; status?: string }) =>
      apiRequest("PUT", `/api/recruiting/requisitions/${requisitionId}/job-ad-draft`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "job-ad-draft"] });
      setIsEditing(false);
      toast({ title: "Job ad saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/recruiting/requisitions/${requisitionId}/job-ad-draft`, {
        draftBody: editorBody, templateId: selectedTemplateId || undefined, status: "finalized",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "job-ad-draft"] });
      setIsEditing(false);
      toast({ title: "Job ad finalized", description: "The ad has been finalized and is ready to post." });
    },
    onError: (err: any) => {
      toast({ title: "Finalize failed", description: err?.message, variant: "destructive" });
    },
  });

  // Live preview: re-populate editor body with current requisition data on demand
  const handlePreview = async () => {
    if (previewMode) { setPreviewMode(false); return; }
    try {
      const res = await fetch("/api/recruiting/job-ad-templates/preview-body", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateBody: editorBody, requisitionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPopulated(data.populated || editorBody);
      } else {
        setPopulated(editorBody);
      }
    } catch {
      setPopulated(editorBody);
    }
    setPreviewMode(true);
  };

  if (!isRecruiter) return null;

  const hasDraft = !!draft?.draftBody || !!editorBody;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Job Ad
            {draft && <DraftStatusBadge status={draft.status} />}
          </CardTitle>
          {hasDraft && !isEditing && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={handlePreview} data-testid="btn-preview-job-ad">
                {previewMode ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
                {previewMode ? "Hide Preview" : "Preview"}
              </Button>
              {draft?.status !== "finalized" && draft?.status !== "posted" && (
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(true); setPreviewMode(false); }} data-testid="btn-edit-job-ad">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {draftLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading job ad…
          </div>
        ) : (!hasDraft || isEditing) ? (
          /* ── Editor Mode ─────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Template selector */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                {hasDraft ? "Switch template" : "Select a template to start"}
              </Label>
              <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
                <SelectTrigger className="w-full" data-testid="select-job-ad-template">
                  <SelectValue placeholder="Choose a job ad template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <SelectItem value="none" disabled>No templates available — ask an admin to create one</SelectItem>
                  ) : templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.driverTypes?.length > 0 ? ` — ${t.driverTypes.join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplateId && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {populatingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Info className="h-3 w-3" />}
                  {populatingId ? "Auto-populating from campaign data…" : "Template auto-populated with campaign data. Edit as needed below."}
                </p>
              )}
            </div>

            {/* Auto-populated data summary */}
            {requisition && (
              <div className="rounded-md bg-muted/50 border border-border p-3 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 text-[10px]">Auto-fill values from campaign</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {requisition.compensationMin && <p><span className="text-muted-foreground">Pay rate:</span> ${Number(requisition.compensationMin).toFixed(2)}</p>}
                  {requisition.market && <p><span className="text-muted-foreground">Market:</span> {requisition.market}</p>}
                  {requisition.targetHires && <p><span className="text-muted-foreground">Target count:</span> {requisition.targetHires}</p>}
                  {requisition.targetFillDate && <p><span className="text-muted-foreground">Fill date:</span> {format(new Date(requisition.targetFillDate), "MMM d, yyyy")}</p>}
                  {requisition.workType && <p><span className="text-muted-foreground">Schedule:</span> {requisition.workType === "ON_DEMAND" ? "On-Demand" : "Shift-based"}</p>}
                </div>
              </div>
            )}

            {/* Editor textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Job Ad Content</Label>
                <Button size="sm" variant="ghost" onClick={handlePreview} className="text-xs h-7 px-2" data-testid="btn-toggle-preview">
                  {previewMode ? <><EyeOff className="h-3 w-3 mr-1" />Raw</> : <><Eye className="h-3 w-3 mr-1" />Preview</>}
                </Button>
              </div>
              {previewMode ? (
                <div className="rounded-md border border-border bg-background p-4 text-sm whitespace-pre-wrap min-h-[200px]">
                  {populated || editorBody}
                </div>
              ) : (
                <Textarea
                  value={editorBody}
                  onChange={e => setEditorBody(e.target.value)}
                  placeholder="Start typing your job ad, or select a template above to auto-populate…"
                  className="min-h-[220px] text-sm font-mono"
                  data-testid="textarea-job-ad-body"
                />
              )}
            </div>

            {/* Placeholder reference */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">Available placeholders</summary>
              <div className="flex flex-wrap gap-1 mt-2">
                {PLACEHOLDERS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setEditorBody(b => b + p.key)}
                    title={p.label}
                    className="font-mono rounded px-1.5 py-0.5 bg-muted text-muted-foreground hover-elevate"
                  >
                    {p.key}
                  </button>
                ))}
              </div>
            </details>

            {/* Save / Finalize actions */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {isEditing && (
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setPreviewMode(false); }}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveMutation.mutate({ draftBody: editorBody, templateId: selectedTemplateId || undefined })}
                disabled={saveMutation.isPending || !editorBody.trim()}
                data-testid="btn-save-job-ad-draft"
              >
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save Draft
              </Button>
              <Button
                size="sm"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending || !editorBody.trim()}
                data-testid="btn-finalize-job-ad"
              >
                {finalizeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Finalize
              </Button>
            </div>

            {!editorBody.trim() && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Select a template or type content to enable save.
              </p>
            )}
          </div>
        ) : previewMode ? (
          /* ── Preview mode (read-only) ──────────────────────────────────────── */
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background p-4 text-sm whitespace-pre-wrap min-h-[160px]">
              {populated || editorBody || draft.draftBody}
            </div>
            {draft.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved {format(new Date(draft.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                {draft.updatedBy ? ` by ${draft.updatedBy}` : ""}
              </p>
            )}
          </div>
        ) : (
          /* ── Saved draft read-only view ───────────────────────────────────── */
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 border border-border p-4 text-sm whitespace-pre-wrap min-h-[100px] text-foreground">
              {draft.draftBody || editorBody}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {draft.updatedAt && (
                <span>Last saved {format(new Date(draft.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span>
              )}
              {draft.finalizedAt && (
                <span>Finalized {format(new Date(draft.finalizedAt), "MMM d, yyyy")}</span>
              )}
              {draft.templateId && templates.find((t: any) => t.id === draft.templateId) && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Template: {templates.find((t: any) => t.id === draft.templateId)?.name}
                </span>
              )}
            </div>
            {draft.status === "finalized" && (
              <div className="flex items-center gap-2 rounded-md px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-800 dark:text-green-300 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>This job ad is finalized and ready to post.</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
