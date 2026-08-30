import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Eye, Send, Search, RefreshCw,
  AlertTriangle, FileText, Mail, MessageSquare, Mic,
  Copy, CheckCircle2, XCircle,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = ["email", "sms", "voice"] as const;
const CATEGORIES = ["Drivers", "Claims", "Recruiting", "Dispatch", "Customers", "Vendors", "System"] as const;

const MERGE_FIELDS = [
  { field: "{{DriverName}}", label: "Driver Name", sample: "John Smith" },
  { field: "{{AccountName}}", label: "Account Name", sample: "Acme Logistics" },
  { field: "{{ClaimNumber}}", label: "Claim Number", sample: "CLM-2026-00142" },
  { field: "{{ClaimStatus}}", label: "Claim Status", sample: "Under Review" },
  { field: "{{ClaimAmount}}", label: "Claim Amount", sample: "$4,250.00" },
  { field: "{{MoveID}}", label: "Move ID", sample: "MOV-98321" },
  { field: "{{Date}}", label: "Date", sample: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
  { field: "{{Time}}", label: "Time", sample: "9:30 AM" },
];

const SAMPLE_CONTEXT: Record<string, string> = Object.fromEntries(
  MERGE_FIELDS.map(f => [f.field.replace(/\{\{|\}\}/g, ""), f.sample])
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommTemplate {
  id: string;
  slug: string;
  name: string;
  channel: string;
  category: string | null;
  subject: string | null;
  body_html: string;
  body_text: string | null;
  variables: string[];
  is_active: boolean;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMergeFields(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? `{{${key}}}`);
}

function typeIcon(channel: string) {
  if (channel === "sms") return <MessageSquare className="w-3.5 h-3.5" />;
  if (channel === "voice") return <Mic className="w-3.5 h-3.5" />;
  return <Mail className="w-3.5 h-3.5" />;
}

function typeBadgeVariant(channel: string): "default" | "secondary" | "outline" {
  if (channel === "sms") return "secondary";
  if (channel === "voice") return "outline";
  return "default";
}

// ── Form Schema ───────────────────────────────────────────────────────────────

const templateSchema = z.object({
  slug: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Uppercase letters, numbers, and underscores only"),
  name: z.string().min(1, "Name is required"),
  channel: z.enum(["email", "sms", "voice"]),
  category: z.string().min(1, "Category is required"),
  subject: z.string().optional(),
  body_html: z.string().min(1, "Body is required"),
  is_active: z.boolean().default(true),
});
type TemplateForm = z.infer<typeof templateSchema>;

// ── Merge Fields Panel ────────────────────────────────────────────────────────

function MergeFieldsPanel({ onInsert }: { onInsert: (field: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (field: string) => {
    navigator.clipboard.writeText(field).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merge Fields</p>
      <div className="space-y-1">
        {MERGE_FIELDS.map(({ field, label, sample }) => (
          <div key={field} className="flex items-center justify-between gap-2 py-1 px-2 rounded-md hover-elevate group">
            <div className="min-w-0">
              <div className="text-xs font-mono text-foreground">{field}</div>
              <div className="text-xs text-muted-foreground">{label} · e.g. {sample}</div>
            </div>
            <div className="flex gap-1 shrink-0 invisible group-hover:visible">
              <Button size="icon" variant="ghost" className="h-6 w-6"
                onClick={() => handleCopy(field)}
                title="Copy to clipboard"
                data-testid={`button-copy-${field}`}>
                {copied === field
                  ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                  : <Copy className="w-3 h-3" />
                }
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6"
                onClick={() => onInsert(field)}
                title="Insert into body"
                data-testid={`button-insert-${field}`}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Template Editor Dialog ────────────────────────────────────────────────────

function TemplateEditorDialog({
  open, onClose, template,
}: { open: boolean; onClose: () => void; template?: CommTemplate }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!template;
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  const form = useForm<TemplateForm>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      slug: template?.slug ?? "",
      name: template?.name ?? "",
      channel: (template?.channel as any) ?? "email",
      category: template?.category ?? "",
      subject: template?.subject ?? "",
      body_html: template?.body_html ?? "",
      is_active: template?.is_active ?? true,
    },
  });

  const channel = form.watch("channel");
  const bodyValue = form.watch("body_html");
  const subjectValue = form.watch("subject") ?? "";

  const mutation = useMutation({
    mutationFn: (data: TemplateForm) =>
      isEdit
        ? apiRequest("PATCH", `/api/admin/comm-templates/${template!.id}`, data)
        : apiRequest("POST", "/api/admin/comm-templates", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/comm-templates"] });
      toast({ title: isEdit ? "Template updated" : "Template created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });

  const handleInsert = (field: string) => {
    const cur = form.getValues("body_html");
    form.setValue("body_html", cur + field);
  };

  const previewSubject = renderMergeFields(subjectValue, SAMPLE_CONTEXT);
  const previewBody = renderMergeFields(bodyValue, SAMPLE_CONTEXT);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-2 shrink-0">
          <Button
            variant={activeTab === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("edit")}
            data-testid="tab-edit"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
          </Button>
          <Button
            variant={activeTab === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("preview")}
            data-testid="tab-preview"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />Preview
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "edit" ? (
            <form id="template-form" onSubmit={form.handleSubmit(d => mutation.mutate(d))}>
              <div className="flex gap-4 pt-2">
                {/* Left: fields */}
                <div className="flex-1 space-y-4 min-w-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Slug <span className="text-destructive">*</span></Label>
                      <Input {...form.register("slug")} placeholder="CLAIM_CREATED"
                        disabled={isEdit}
                        className="font-mono text-sm"
                        data-testid="input-slug" />
                      {form.formState.errors.slug && (
                        <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Name <span className="text-destructive">*</span></Label>
                      <Input {...form.register("name")} placeholder="Claim Created Notification"
                        data-testid="input-name" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select value={channel} onValueChange={v => form.setValue("channel", v as any)}>
                        <SelectTrigger data-testid="select-channel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_TYPES.map(t => (
                            <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category <span className="text-destructive">*</span></Label>
                      <Select value={form.watch("category")} onValueChange={v => form.setValue("category", v)}>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.category && (
                        <p className="text-xs text-destructive">{form.formState.errors.category.message}</p>
                      )}
                    </div>
                  </div>

                  {channel === "email" && (
                    <div className="space-y-1.5">
                      <Label>Subject Line</Label>
                      <Input {...form.register("subject")} placeholder="New Claim — {{ClaimNumber}}"
                        data-testid="input-subject" />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Body <span className="text-destructive">*</span></Label>
                    <Textarea
                      {...form.register("body_html")}
                      rows={10}
                      placeholder={channel === "email"
                        ? "HTML email body. Use {{DriverName}}, {{ClaimNumber}}, etc."
                        : "Message body. Use {{DriverName}}, {{ClaimNumber}}, etc."
                      }
                      className="font-mono text-sm"
                      data-testid="textarea-body"
                    />
                    {form.formState.errors.body_html && (
                      <p className="text-xs text-destructive">{form.formState.errors.body_html.message}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.watch("is_active")}
                      onCheckedChange={v => form.setValue("is_active", v)}
                      data-testid="switch-active"
                    />
                    <Label>Active</Label>
                  </div>
                </div>

                {/* Right: merge fields */}
                <div className="w-60 shrink-0">
                  <MergeFieldsPanel onInsert={handleInsert} />
                </div>
              </div>
            </form>
          ) : (
            /* Preview tab */
            <div className="pt-2 space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Subject</p>
                <p className="text-sm font-medium">{previewSubject || "(no subject)"}</p>
              </div>
              <div className="rounded-md border">
                {channel === "email" ? (
                  <div className="p-4">
                    <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Eye className="w-3 h-3" /> Rendered preview with sample data
                    </div>
                    <div
                      className="prose prose-sm max-w-none text-foreground"
                      dangerouslySetInnerHTML={{ __html: previewBody }}
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Eye className="w-3 h-3" /> Rendered preview with sample data
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{previewBody}</p>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground font-medium mb-2">Sample Data Used</p>
                <div className="grid grid-cols-2 gap-1">
                  {MERGE_FIELDS.map(({ field, sample }) => (
                    <div key={field} className="text-xs flex gap-1.5">
                      <span className="font-mono text-muted-foreground">{field}</span>
                      <span className="text-foreground">→ {sample}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="template-form"
            disabled={mutation.isPending}
            data-testid="button-save-template"
          >
            {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Test Send Dialog ──────────────────────────────────────────────────────────

function TestSendDialog({
  open, onClose, template,
}: { open: boolean; onClose: () => void; template?: CommTemplate }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/comm-templates/${template!.id}/test-send`, { email }),
    onSuccess: () => {
      toast({ title: "Test email sent", description: `Sent to ${email}` });
      onClose();
    },
    onError: () => toast({ title: "Test send failed", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send a preview of <strong>{template?.name}</strong> with sample merge field data to a test recipient.
          </p>
          <div className="space-y-1.5">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              data-testid="input-test-email"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!email || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-confirm-test-send"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {mutation.isPending ? "Sending…" : "Send Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Dialog ─────────────────────────────────────────────────────────────

function DeleteTemplateDialog({
  open, onClose, template,
}: { open: boolean; onClose: () => void; template?: CommTemplate }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/comm-templates/${template!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/comm-templates"] });
      toast({ title: "Template removed" });
      onClose();
    },
    onError: () => toast({ title: "Failed to remove template", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Remove Template</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove <strong>{template?.name}</strong>? Automations referencing this template will fail to send until a replacement is configured.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}
            data-testid="button-confirm-delete-template">
            {mutation.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template, onEdit, onTestSend, onDelete,
}: {
  template: CommTemplate;
  onEdit: () => void;
  onTestSend: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-template-${template.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{template.name}</span>
              <Badge variant={typeBadgeVariant(template.channel)} className="text-xs gap-1">
                {typeIcon(template.channel)}
                {template.channel.charAt(0).toUpperCase() + template.channel.slice(1)}
              </Badge>
              {template.category && (
                <Badge variant="outline" className="text-xs">{template.category}</Badge>
              )}
              {!template.is_active && (
                <Badge variant="secondary" className="text-xs text-muted-foreground">Inactive</Badge>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1">{template.slug}</p>
            {template.subject && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Subject: {template.subject}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {template.channel === "email" && (
              <Button size="icon" variant="ghost" onClick={onTestSend} title="Test send"
                data-testid={`button-test-send-${template.id}`}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={onEdit} title="Edit"
              data-testid={`button-edit-template-${template.id}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} title="Delete"
              data-testid={`button-delete-template-${template.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main TemplatesView ────────────────────────────────────────────────────────

export function TemplatesView() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CommTemplate | undefined>();
  const [testSendTarget, setTestSendTarget] = useState<CommTemplate | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CommTemplate | undefined>();

  const { data: templates = [], isLoading, error, refetch } = useQuery<CommTemplate[]>({
    queryKey: ["/api/admin/comm-templates"],
  });

  const filtered = useMemo(() => {
    let result = templates;
    if (filterType !== "all") result = result.filter(t => t.channel === filterType);
    if (filterCategory !== "all") result = result.filter(t => t.category === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, filterType, filterCategory, search]);

  const counts = useMemo(() => ({
    email: templates.filter(t => t.channel === "email").length,
    sms: templates.filter(t => t.channel === "sms").length,
    voice: templates.filter(t => t.channel === "voice").length,
    active: templates.filter(t => t.is_active).length,
  }), [templates]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Failed to load templates.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Template Library</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage email, SMS, and voice templates used across all communication automations.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-template">
          <Plus className="w-4 h-4 mr-1.5" />New Template
        </Button>
      </div>

      {/* Summary stats */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Email", count: counts.email, icon: <Mail className="w-3.5 h-3.5" /> },
          { label: "SMS", count: counts.sms, icon: <MessageSquare className="w-3.5 h-3.5" /> },
          { label: "Voice", count: counts.voice, icon: <Mic className="w-3.5 h-3.5" /> },
          { label: "Active", count: counts.active, icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> },
        ].map(({ label, count, icon }) => (
          <div key={label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {icon}<span className="font-medium text-foreground">{count}</span> {label}
          </div>
        ))}
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-8"
            data-testid="input-search-templates"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36" data-testid="select-filter-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TEMPLATE_TYPES.map(t => (
              <SelectItem key={t} value={t} className="capitalize">
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40" data-testid="select-filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Template list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            {templates.length === 0 ? (
              <>
                <p className="text-sm font-medium">No templates yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first template to get started.</p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Create Template
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No templates match your filters.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => setEditTarget(t)}
              onTestSend={() => setTestSendTarget(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <TemplateEditorDialog
        open={createOpen || !!editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(undefined); }}
        template={editTarget}
      />
      <TestSendDialog
        open={!!testSendTarget}
        onClose={() => setTestSendTarget(undefined)}
        template={testSendTarget}
      />
      <DeleteTemplateDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(undefined)}
        template={deleteTarget}
      />
    </div>
  );
}
