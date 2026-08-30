import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, XCircle, AlertTriangle, Mail, RefreshCw, Shield,
  Key, Link2, Send, Loader2, Info, ExternalLink, Server, Circle,
  Pencil, Save, X, ChevronRight, Building2, Inbox, Calendar,
  MessageSquare, FolderOpen, Cloud, Users, Settings, Play,
  FileBarChart, Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ValidationStatus = "pass" | "fail" | "warning" | "not_checked";
type OverallStatus = "failed" | "partially_operational" | "not_checked" | "fully_operational";

interface ValidationCheck {
  key: string;
  label: string;
  status: ValidationStatus;
  message: string;
  technicalError?: string;
  canEditField: boolean;
  relatedFields: string[];
}

interface MailboxResult {
  profile: string;
  email: string;
  mailboxType?: "user" | "shared" | "group" | "unknown";
  status: "pass" | "fail" | "warning";
  checks: {
    found:       ValidationStatus;
    mailEnabled: ValidationStatus;
    mailSend:    ValidationStatus;
  };
  message: string;
  technicalError?: string;
}

interface ValidationResult {
  overallStatus: OverallStatus;
  checkedAt: string;
  checks: ValidationCheck[];
  mailboxes?: MailboxResult[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const FIELD_META: Record<string, {
  label: string;
  placeholder: string;
  type: "text" | "password" | "email";
  hint: string;
  validate: (v: string) => string | null;
}> = {
  MICROSOFT_TENANT_ID: {
    label:    "Tenant ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:     "text",
    hint:     "Azure Active Directory (tenant) GUID",
    validate: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
  MICROSOFT_CLIENT_ID: {
    label:    "Client ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:     "text",
    hint:     "Azure App Registration Application (client) ID GUID",
    validate: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
  MICROSOFT_CLIENT_SECRET: {
    label:    "Client Secret",
    placeholder: "Enter new client secret value…",
    type:     "password",
    hint:     "Value from Azure App Registration → Certificates & Secrets. Never shown after save.",
    validate: v => v.trim() ? null : "Client Secret cannot be blank",
  },
  MICROSOFT_SENDER_EMAIL: {
    label:    "Sender Email",
    placeholder: "reports@yourdomain.com",
    type:     "email",
    hint:     "Shared mailbox SMTP address used as the From address",
    validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
      ? null : "Must be a valid email address",
  },
  MICROSOFT_SENDER_OBJECT_ID: {
    label:    "Mailbox Object ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:     "text",
    hint:     "Azure AD object ID of the sender mailbox (fixes ErrorInvalidUser 404 for shared mailboxes)",
    validate: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
};

const FIELD_TO_BODY: Record<string, string> = {
  MICROSOFT_TENANT_ID:        "tenantId",
  MICROSOFT_CLIENT_ID:        "clientId",
  MICROSOFT_CLIENT_SECRET:    "clientSecret",
  MICROSOFT_SENDER_EMAIL:     "senderEmail",
  MICROSOFT_SENDER_OBJECT_ID: "senderObjectId",
};

const UPDATABLE_FIELDS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_SENDER_EMAIL",
  "MICROSOFT_SENDER_OBJECT_ID",
] as const;

const SENDER_PROFILES = [
  { profile: "Reports",    email: "reports@driverondemand.co",    purpose: "Automated account reports & schedules" },
  { profile: "Data",       email: "data@driverondemand.co",       purpose: "Data exports & analytics delivery" },
  { profile: "Support",    email: "support@driverondemand.co",    purpose: "Support communications & alerts" },
  { profile: "Dispatch",   email: "dispatch@driverondemand.co",   purpose: "Dispatch notifications & updates" },
  { profile: "Recruiting", email: "recruiting@driverondemand.co", purpose: "Recruiting & candidate communications" },
];

const STATIC_CHECKS: { key: string; label: string; description: string }[] = [
  { key: "secrets_present",   label: "Secrets Present",  description: "All required configuration values are present." },
  { key: "oauth_token_valid", label: "OAuth Token Valid", description: "The Azure app credentials can acquire a Microsoft Graph access token." },
];

// ── Utility helpers ────────────────────────────────────────────────────────────
function formatCheckedAt(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZoneName: "short",
    });
  } catch { return iso; }
}

// ── Shared status display components ──────────────────────────────────────────
function OverallStatusBadge({ status }: { status: OverallStatus }) {
  if (status === "fully_operational") {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
        <CheckCircle2 className="h-3 w-3" />Fully Operational
      </Badge>
    );
  }
  if (status === "partially_operational") {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 gap-1">
        <AlertTriangle className="h-3 w-3" />Partially Operational
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
        <XCircle className="h-3 w-3" />Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 gap-1">
      <Circle className="h-3 w-3" />Not Checked
    </Badge>
  );
}

function CheckStatusIcon({ status }: { status: ValidationStatus }) {
  if (status === "pass")    return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />;
  if (status === "fail")    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />;
}

function CheckStatusBadge({ status }: { status: ValidationStatus }) {
  if (status === "pass")    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs shrink-0">Pass</Badge>;
  if (status === "fail")    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs shrink-0">Failed</Badge>;
  if (status === "warning") return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs shrink-0">Warning</Badge>;
  return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">Not Checked</Badge>;
}

// ── Inline edit form (for validation-check rows) ───────────────────────────────
function InlineEditForm({
  relatedFields,
  onSave,
  onCancel,
  isSaving,
}: {
  relatedFields: string[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const editableFields = relatedFields.filter(f => FIELD_META[f]);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(editableFields.map(f => [f, ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(field: string, val: string) {
    setValues(prev => ({ ...prev, [field]: val }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: "" }));
  }

  function handleSave() {
    const newErrors: Record<string, string> = {};
    let hasAnyValue = false;
    for (const field of editableFields) {
      const val = values[field] ?? "";
      if (val.trim()) {
        hasAnyValue = true;
        const err = FIELD_META[field].validate(val);
        if (err) newErrors[field] = err;
      }
    }
    if (!hasAnyValue) {
      setErrors(Object.fromEntries(editableFields.map(f => [f, "Enter a value to update this field"])));
      return;
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const payload: Record<string, string> = {};
    for (const field of editableFields) {
      if (values[field]?.trim()) payload[FIELD_TO_BODY[field]] = values[field].trim();
    }
    onSave(payload);
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Configuration</p>
      <p className="text-xs text-muted-foreground -mt-2">Only fill in the field(s) you want to change. Leave blank to keep the current value.</p>
      {editableFields.map(field => {
        const meta = FIELD_META[field];
        const error = errors[field];
        return (
          <div key={field} className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor={`edit-${field}`}>{meta.label}</Label>
            <Input
              id={`edit-${field}`}
              type={meta.type}
              placeholder={meta.placeholder}
              value={values[field] ?? ""}
              onChange={e => handleChange(field, e.target.value)}
              disabled={isSaving}
              data-testid={`input-edit-${field.toLowerCase()}`}
              className={error ? "border-destructive focus-visible:ring-destructive" : ""}
              autoComplete={meta.type === "password" ? "new-password" : "off"}
            />
            {error
              ? <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</p>
              : <p className="text-xs text-muted-foreground">{meta.hint}</p>
            }
          </div>
        );
      })}
      {editableFields.includes("MICROSOFT_CLIENT_SECRET") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Secret values are stored securely and are never displayed after save.</span>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="btn-save-ms365-config">
          {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save &amp; Re-validate</>}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isSaving} data-testid="btn-cancel-ms365-edit">
          <X className="h-3.5 w-3.5 mr-1.5" />Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Standalone credential update panel ────────────────────────────────────────
function UpdateCredentialsPanel({
  onSaveConfig,
  onCancel,
  isSaving,
}: {
  onSaveConfig: (values: Record<string, string>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [selectedField, setSelectedField] = useState<string>("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = selectedField ? FIELD_META[selectedField] : null;

  function handleFieldChange(f: string) { setSelectedField(f); setValue(""); setError(null); }

  function handleSave() {
    if (!selectedField || !meta) return;
    const err = meta.validate(value);
    if (err) { setError(err); return; }
    onSaveConfig({ [FIELD_TO_BODY[selectedField]]: value.trim() });
    setValue(""); setSelectedField(""); setError(null);
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Credentials / Configuration</p>
        <Button size="icon" variant="ghost" onClick={onCancel} className="h-6 w-6" data-testid="btn-close-update-creds">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Select a field to update. The new value takes effect immediately and re-validation runs automatically.</p>
      <div className="space-y-1.5">
        <Label>Field</Label>
        <Select value={selectedField} onValueChange={handleFieldChange} disabled={isSaving}>
          <SelectTrigger data-testid="select-config-field">
            <SelectValue placeholder="Choose a field to update…" />
          </SelectTrigger>
          <SelectContent>
            {UPDATABLE_FIELDS.map(f => (
              <SelectItem key={f} value={f}>{FIELD_META[f].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {meta && (
        <div className="space-y-1.5">
          <Label htmlFor="cfg-value">{meta.label}</Label>
          <Input
            id="cfg-value"
            type={meta.type}
            placeholder={meta.placeholder}
            value={value}
            onChange={e => { setValue(e.target.value); setError(null); }}
            disabled={isSaving}
            data-testid="input-config-value"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
      {selectedField === "MICROSOFT_CLIENT_SECRET" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Secret values are stored securely and are never displayed after save.</span>
        </div>
      )}
      <Button onClick={handleSave} disabled={!selectedField || !value.trim() || isSaving} data-testid="button-save-config">
        {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-2" />Save &amp; Re-validate</>}
      </Button>
    </div>
  );
}

// ── Mailbox email edit form ─────────────────────────────────────────────────
function MailboxEmailEditForm({
  profile, currentEmail, onSave, onCancel, isSaving,
}: {
  profile: string;
  currentEmail: string;
  onSave: (profile: string, email: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function handleSave() {
    if (!value.trim()) { setError(`${profile} email cannot be blank.`); return; }
    if (!EMAIL_RE.test(value.trim())) { setError("Must be a valid email address."); return; }
    onSave(profile, value.trim());
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update {profile} Mailbox Email</p>
      <div className="space-y-1.5">
        <Label htmlFor={`mailbox-edit-${profile}`} className="text-sm">{profile} Email</Label>
        <Input
          id={`mailbox-edit-${profile}`}
          type="email"
          placeholder={currentEmail}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null); }}
          disabled={isSaving}
          autoComplete="off"
          data-testid={`input-mailbox-email-${profile.toLowerCase()}`}
          className={error ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {error
          ? <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</p>
          : <p className="text-xs text-muted-foreground">Must be a valid mailbox in the current Microsoft 365 tenant.</p>
        }
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid={`btn-save-mailbox-${profile.toLowerCase()}`}>
          {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save &amp; Re-validate</>}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isSaving} data-testid={`btn-cancel-mailbox-${profile.toLowerCase()}`}>
          <X className="h-3.5 w-3.5 mr-1.5" />Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Mailbox sub-check row ──────────────────────────────────────────────────────
function MailboxSubCheck({ label, status }: { label: string; status: ValidationStatus }) {
  return (
    <div className="flex items-center gap-2">
      <CheckStatusIcon status={status} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <CheckStatusBadge status={status} />
    </div>
  );
}

// ── Mailbox detail card (expandable) ──────────────────────────────────────────
function MailboxDetailCard({
  mailbox, isSuperAdmin, onSaveMailbox, isSavingMailbox,
}: {
  mailbox: MailboxResult;
  isSuperAdmin: boolean;
  onSaveMailbox: (profile: string, email: string) => void;
  isSavingMailbox: boolean;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const isFail = mailbox.status === "fail";
  const canEdit = isSuperAdmin && isFail;

  return (
    <div className="py-3 space-y-2" data-testid={`mailbox-row-${mailbox.profile.toLowerCase()}`}>
      <div className="flex items-start gap-3">
        {mailbox.status === "pass"
          ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          : mailbox.status === "fail"
            ? <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
        }
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium leading-snug">{mailbox.profile} Mailbox</p>
            <code className="text-xs text-muted-foreground font-mono">{mailbox.email}</code>
            {mailbox.mailboxType === "group" && (
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                M365 Group
              </Badge>
            )}
            {mailbox.mailboxType === "shared" && (
              <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700">
                Shared Mailbox
              </Badge>
            )}
          </div>
          {mailbox.status === "pass" && (
            <p className="text-xs text-muted-foreground mt-0.5">{mailbox.message}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canEdit && !editOpen && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}
              data-testid={`btn-edit-mailbox-${mailbox.profile.toLowerCase()}`}
              className="h-7 text-xs gap-1">
              <Pencil className="h-3 w-3" />Edit
            </Button>
          )}
          {canEdit && editOpen && (
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}
              data-testid={`btn-cancel-edit-mailbox-header-${mailbox.profile.toLowerCase()}`}
              className="h-7 text-xs gap-1 text-muted-foreground">
              <X className="h-3 w-3" />Cancel
            </Button>
          )}
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            data-testid={`btn-expand-mailbox-${mailbox.profile.toLowerCase()}`}>
            {expanded ? "Hide checks" : "View checks"}
          </button>
          {mailbox.status === "pass"
            ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">Pass</Badge>
            : mailbox.status === "fail"
              ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">Failed</Badge>
              : <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">Warning</Badge>
          }
        </div>
      </div>

      {(isFail || mailbox.status === "warning") && mailbox.message && (
        <div className="ml-7 space-y-1.5">
          <p className="text-sm text-foreground/80">{mailbox.message}</p>
          {mailbox.technicalError && (
            <button type="button" onClick={() => setDetailsOpen(v => !v)}
              data-testid={`btn-toggle-details-mailbox-${mailbox.profile.toLowerCase()}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {detailsOpen ? "Hide Details" : "Details"}
            </button>
          )}
          {detailsOpen && mailbox.technicalError && (
            <pre className="text-xs bg-muted/60 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
              {mailbox.technicalError}
            </pre>
          )}
          {editOpen && (
            <MailboxEmailEditForm
              profile={mailbox.profile}
              currentEmail={mailbox.email}
              onSave={(p, e) => { onSaveMailbox(p, e); setEditOpen(false); }}
              onCancel={() => setEditOpen(false)}
              isSaving={isSavingMailbox}
            />
          )}
        </div>
      )}

      {expanded && (
        <div className="ml-7 space-y-2 pt-1">
          <MailboxSubCheck label="Mailbox Found"        status={mailbox.checks.found} />
          <MailboxSubCheck label="Mail-Enabled"         status={mailbox.checks.mailEnabled} />
          <MailboxSubCheck label="Mail.Send Permission" status={mailbox.checks.mailSend} />
          {mailbox.checks.mailSend === "warning" && (
            <p className="text-xs text-muted-foreground ml-6">Mail.Send is set as warning until confirmed by a test email send.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Integration check row ──────────────────────────────────────────────────────
function IntegrationCheckRow({
  check, onSaveConfig, isSuperAdmin, isSaving,
}: {
  check: ValidationCheck;
  onSaveConfig: (values: Record<string, string>) => void;
  isSuperAdmin: boolean;
  isSaving: boolean;
}) {
  const [editOpen,    setEditOpen]    = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasMessage    = !!check.message && check.status !== "not_checked" && check.status !== "pass";
  const hasTechDetail = !!check.technicalError;
  const canEdit       = isSuperAdmin && check.canEditField &&
                        (check.status === "fail" || check.status === "warning") &&
                        check.relatedFields.some(f => FIELD_META[f]);

  return (
    <div className="py-3 space-y-1.5">
      <div className="flex items-start gap-3">
        <CheckStatusIcon status={check.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{check.label}</p>
          {check.status === "not_checked" && <p className="text-xs text-muted-foreground mt-0.5">Not yet checked.</p>}
          {check.status === "pass" && <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>}
        </div>
        <CheckStatusBadge status={check.status} />
      </div>
      {hasMessage && (
        <div className="ml-7 space-y-2">
          <p className="text-sm text-foreground/80">{check.message}</p>
          <div className="flex flex-wrap items-center gap-3">
            {hasTechDetail && (
              <button type="button" onClick={() => setDetailsOpen(v => !v)}
                data-testid={`btn-toggle-details-${check.key}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                {detailsOpen ? "Hide Details" : "Details"}
              </button>
            )}
            {canEdit && !editOpen && (
              <>
                {hasTechDetail && <span className="text-muted-foreground/40 text-xs">·</span>}
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Configuration update required.</p>
                  <button type="button" onClick={() => setEditOpen(true)}
                    data-testid={`btn-edit-config-${check.key}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80">
                    <Pencil className="h-3 w-3" />Edit Configuration
                  </button>
                </div>
              </>
            )}
          </div>
          {hasTechDetail && detailsOpen && (
            <pre className="text-xs bg-muted/60 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground"
              data-testid={`technical-detail-${check.key}`}>
              {check.technicalError}
            </pre>
          )}
          {editOpen && (
            <InlineEditForm
              relatedFields={check.relatedFields}
              onSave={v => { onSaveConfig(v); setEditOpen(false); }}
              onCancel={() => setEditOpen(false)}
              isSaving={isSaving}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Microsoft Services grid ────────────────────────────────────────────────────
const MS_SERVICES = [
  { id: "outlook-email",    label: "Outlook Email",          icon: Mail,         permission: "Mail.Send",   dynamic: true },
  { id: "outlook-calendar", label: "Outlook Calendar",       icon: Calendar,     permission: null,          dynamic: false },
  { id: "teams",            label: "Teams Notifications",    icon: MessageSquare,permission: null,          dynamic: false },
  { id: "shared-mailboxes", label: "Shared Mailboxes",       icon: Inbox,        permission: "Mail.Send",   dynamic: true },
  { id: "dist-groups",      label: "Distribution Groups",    icon: Users,        permission: null,          dynamic: false },
  { id: "onedrive",         label: "OneDrive",               icon: Cloud,        permission: null,          dynamic: false },
  { id: "sharepoint",       label: "SharePoint",             icon: FolderOpen,   permission: null,          dynamic: false },
];

function ServiceTile({
  service,
  overallStatus,
  mailboxCount,
}: {
  service: typeof MS_SERVICES[0];
  overallStatus: OverallStatus;
  mailboxCount: number;
}) {
  const Icon = service.icon;
  const isActive = service.dynamic && overallStatus === "fully_operational";
  const isDegraded = service.dynamic && (overallStatus === "partially_operational" || overallStatus === "failed");

  let statusBadge;
  if (!service.dynamic) {
    statusBadge = (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs">
        Not Configured
      </Badge>
    );
  } else if (isActive) {
    statusBadge = (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs gap-1">
        <CheckCircle2 className="h-2.5 w-2.5" />Active
      </Badge>
    );
  } else if (isDegraded) {
    statusBadge = (
      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs gap-1">
        <AlertTriangle className="h-2.5 w-2.5" />Degraded
      </Badge>
    );
  } else {
    statusBadge = (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs">
        Not Checked
      </Badge>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="rounded-md bg-muted p-1.5 shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug">{service.label}</p>
        {service.id === "shared-mailboxes" && isActive && mailboxCount > 0 && (
          <p className="text-xs text-muted-foreground">{mailboxCount} mailbox{mailboxCount !== 1 ? "es" : ""} validated</p>
        )}
        {service.permission && (
          <p className="text-xs text-muted-foreground font-mono">{service.permission}</p>
        )}
        {!service.dynamic && (
          <p className="text-xs text-muted-foreground">Permission not granted</p>
        )}
      </div>
      {statusBadge}
    </div>
  );
}

// ── Test email form (inline, toggleable) ──────────────────────────────────────
function TestEmailForm({
  validationResult,
  onClose,
  onTestEmail,
  isPending,
  emailResult,
}: {
  validationResult: ValidationResult | null;
  onClose: () => void;
  onTestEmail: (opts: { to: string; subject: string; message: string; senderProfile: string }) => void;
  isPending: boolean;
  emailResult: {
    ok: boolean;
    blocked?: boolean;
    blockedReason?: string;
    sentAt?: string;
    senderProfile?: string;
    message?: string;
    error?: string;
    technicalError?: string;
    steps?: Array<{ label: string; status: "pass" | "fail" | "warn" | "skip"; note?: string }>;
  } | null;
}) {
  const PROFILES = ["Reports", "Data", "Support", "Dispatch", "Recruiting"];
  const [to,             setTo]             = useState("");
  const [subject,        setSubject]        = useState("DriverHub Microsoft 365 Email Test");
  const [message,        setMessage]        = useState("This is a test email from DriverHub using the selected sender mailbox.");
  const [selectedProfile, setSelectedProfile] = useState("Reports");

  const selectedMailbox = validationResult?.mailboxes?.find(m => m.profile === selectedProfile);
  const mailboxBlocked  = selectedMailbox
    ? selectedMailbox.checks.found === "fail" || selectedMailbox.checks.mailEnabled === "fail"
    : false;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Email Delivery</p>
        <Button size="icon" variant="ghost" onClick={onClose} className="h-6 w-6" data-testid="btn-close-test-email">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Validate the full pipeline by sending a real email through Microsoft Graph.</p>

      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="test-from">Send From Profile</Label>
          <div className="flex items-center gap-2">
            <Select value={selectedProfile} onValueChange={v => setSelectedProfile(v)} disabled={isPending}>
              <SelectTrigger id="test-from" className="w-48" data-testid="select-sender-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILES.map(p => {
                  const mb = validationResult?.mailboxes?.find(m => m.profile === p);
                  const blocked = mb ? mb.checks.found === "fail" || mb.checks.mailEnabled === "fail" : false;
                  return (
                    <SelectItem key={p} value={p} data-testid={`option-profile-${p.toLowerCase()}`}>
                      {p}{blocked ? " — unavailable" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedMailbox && (
              <div className="flex items-center gap-1.5 text-sm">
                {selectedMailbox.status === "pass"
                  ? <><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /><span className="text-green-700 dark:text-green-400">Verified</span></>
                  : selectedMailbox.status === "fail"
                    ? <><XCircle className="h-4 w-4 text-destructive" /><span className="text-destructive">Not available</span></>
                    : <><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-amber-600 dark:text-amber-400">Not confirmed</span></>
                }
              </div>
            )}
          </div>
          {mailboxBlocked && (
            <p className="text-xs text-destructive mt-1">
              The {selectedProfile} mailbox failed verification — resolve before sending.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="test-to">To</Label>
          <Input id="test-to" type="email" placeholder="recipient@example.com"
            value={to} onChange={e => setTo(e.target.value)} disabled={isPending}
            data-testid="input-test-email-to" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="test-subject">Subject</Label>
          <Input id="test-subject" value={subject} onChange={e => setSubject(e.target.value)}
            disabled={isPending} data-testid="input-test-email-subject" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="test-body">Message Body</Label>
          <Input id="test-body" value={message} onChange={e => setMessage(e.target.value)}
            disabled={isPending} data-testid="input-test-email-body" />
        </div>
      </div>

      <Button onClick={() => onTestEmail({ to, subject, message, senderProfile: selectedProfile })}
        disabled={!to || isPending || mailboxBlocked} data-testid="button-send-test-email">
        {isPending
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending from {selectedProfile}…</>
          : <><Send className="h-4 w-4 mr-2" />Send Test from {selectedProfile}</>
        }
      </Button>

      {emailResult && (
        <div className="space-y-3" data-testid="result-email-test">
          {/* ── 5-step result checklist ── */}
          {emailResult.steps && (
            <div className="rounded-md border border-border bg-background divide-y">
              {emailResult.steps.map(step => (
                <div key={step.label} className="flex items-start gap-3 px-4 py-2.5">
                  {step.status === "pass"
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    : step.status === "fail"
                      ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      : step.status === "warn"
                        ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{step.label}</p>
                    {step.note && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate" title={step.note}>{step.note}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium shrink-0 mt-0.5 ${
                    step.status === "pass" ? "text-green-600 dark:text-green-400"
                    : step.status === "fail" ? "text-destructive"
                    : step.status === "warn" ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                  }`}>
                    {step.status === "pass" ? "Pass" : step.status === "fail" ? "Fail" : step.status === "warn" ? "Warn" : "Skipped"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Footer: summary + technical details on failure ── */}
          {!emailResult.ok && !emailResult.blocked && emailResult.technicalError && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1.5 px-1">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                Show technical details
              </summary>
              <pre className="mt-1.5 text-xs bg-muted/60 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
                {emailResult.technicalError}
              </pre>
            </details>
          )}

          {/* ── Simple fallback summary if steps weren't computed (error before send) ── */}
          {!emailResult.steps && (
            emailResult.ok ? (
              <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="font-medium">{emailResult.message}</p>
              </div>
            ) : emailResult.blocked ? (
              <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{emailResult.blockedReason ?? "Test email blocked — review the validation checklist."}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{emailResult.error ?? "Email send failed. Verify mailbox and permissions."}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────
export default function Microsoft365AdminView() {
  const { toast } = useToast();
  const { isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canEdit = isSuperAdmin || isRootSuperAdmin;

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [connResult,       setConnResult]        = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [emailResult,      setEmailResult]       = useState<{
    ok: boolean; blocked?: boolean; blockedReason?: string; sentAt?: string;
    senderProfile?: string; message?: string; error?: string; technicalError?: string;
    steps?: Array<{ label: string; status: "pass" | "fail" | "warn" | "skip"; note?: string }>;
  } | null>(null);

  const [showUpdateCreds, setShowUpdateCreds] = useState(false);
  const [showTestEmail,   setShowTestEmail]   = useState(false);

  // Auto-run live validation once on mount so the page never shows stale
  // "Not Checked" placeholders when first opened or navigated back to.
  const autoValidated = useRef(false);
  useEffect(() => {
    if (!autoValidated.current) {
      autoValidated.current = true;
      validateMutation.mutate();
    }
  // validateMutation is stable across renders (useMutation reference is stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/integrations/microsoft-graph/status"],
    queryFn:  () => fetch("/api/integrations/microsoft-graph/status").then(r => r.json()),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/validate", {});
      return res.json() as Promise<ValidationResult>;
    },
    onMutate: () => {
      // Immediately clear stale results so the user sees "Checking…" feedback
      // rather than old data sitting there while the request is in flight.
      setValidationResult(null);
    },
    onSuccess: (data) => { setValidationResult(data); refetchStatus(); },
    onError:   (e: any) => toast({ title: "Validation failed", description: e.message ?? "Could not reach the validation service.", variant: "destructive" }),
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/update-config", payload);
      return res.json() as Promise<{ ok: boolean; validationResult: ValidationResult }>;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setValidationResult(data.validationResult);
        setShowUpdateCreds(false);
        refetchStatus();
        toast({ title: "Configuration updated", description: "Settings saved. Validation ran automatically." });
      } else {
        toast({ title: "Update failed", description: "The server returned an error.", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Configuration update failed", description: e.message ?? "Could not save the configuration.", variant: "destructive" }),
  });

  const updateMailboxMutation = useMutation({
    mutationFn: async ({ profile, email }: { profile: string; email: string }) => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/update-mailbox-config", { profile, email });
      return res.json() as Promise<{ ok: boolean; validationResult: ValidationResult }>;
    },
    onSuccess: (data) => {
      if (data.ok) { setValidationResult(data.validationResult); refetchStatus(); toast({ title: "Mailbox updated", description: "Email address saved. Validation ran automatically." }); }
      else toast({ title: "Update failed", description: "The server returned an error.", variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Mailbox update failed", description: e.message ?? "Could not save the mailbox email.", variant: "destructive" }),
  });

  const testConnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/test-connection", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setConnResult(data);
      if (data.ok) toast({ title: "Connection successful", description: data.message });
      else toast({ title: "Connection failed", description: data.error, variant: "destructive" });
    },
    onError: (e: any) => { setConnResult({ ok: false, error: e.message }); toast({ title: "Connection test failed", description: e.message, variant: "destructive" }); },
  });

  const testEmailMutation = useMutation({
    mutationFn: async (opts: { to: string; subject: string; message: string; senderProfile: string }) => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/test-email", opts);
      return res.json();
    },
    onSuccess: (data: any) => {
      const vr = data.validationResult;
      if (vr) { setValidationResult(vr); refetchStatus(); }

      // ── Derive the 5-step checklist from the response ──────────────────────
      const profile = data.senderProfile ?? "Reports";
      const mb      = vr?.mailboxes?.find((m: any) => m.profile === profile);
      const oauthChk = vr?.checks?.find((c: any) => c.key === "oauth_token_valid");

      type StepStatus = "pass" | "fail" | "warn" | "skip";
      const toStepStatus = (s?: string): StepStatus =>
        s === "pass" ? "pass" : s === "fail" ? "fail" : s === "warn" ? "warn" : "fail";

      const oauthStatus: StepStatus = oauthChk ? toStepStatus(oauthChk.status) : (data.ok ? "pass" : "fail");
      const mailboxResolution: StepStatus = mb
        ? toStepStatus(mb.checks?.found)
        : (data.blocked ? "fail" : "skip");
      const mailSendPermission: StepStatus = data.ok
        ? "pass"   // confirmed by the successful send itself
        : mb ? toStepStatus(mb.checks?.mailSend) : "fail";
      const submission: StepStatus  = data.ok ? "pass" : (data.blocked ? "skip" : "fail");
      const delivery: StepStatus    = data.ok ? "pass" : (data.blocked ? "skip" : "fail");

      const steps: Array<{ label: string; status: StepStatus; note?: string }> = [
        { label: "OAuth Authentication",  status: oauthStatus,
          note: oauthChk?.status === "fail" ? (oauthChk.message ?? "Token acquisition failed") : undefined },
        { label: "Mailbox Resolution",    status: mailboxResolution,
          note: mb?.email ?? (data.blocked ? "Mailbox not found or not mail-enabled" : undefined) },
        { label: "Mail.Send Permission",  status: mailSendPermission,
          note: data.ok ? "Confirmed by successful message submission" : (mb?.checks?.mailSend === "warn" ? "Not pre-confirmed; test required" : undefined) },
        { label: "Message Submission",    status: submission,
          note: data.blocked ? "Blocked — resolve validation errors first" : undefined },
        { label: "Delivery Result",       status: delivery,
          note: data.ok ? `Accepted by Microsoft Graph at ${new Date(data.sentAt ?? "").toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : (data.error ?? undefined) },
      ];

      setEmailResult({
        ok: data.ok, blocked: data.blocked, blockedReason: data.blockedReason,
        sentAt: data.sentAt, senderProfile: data.senderProfile,
        message: data.message, error: data.error, technicalError: data.technicalError,
        steps,
      });
      if (data.ok) toast({ title: "Test email sent", description: data.message });
      else if (data.blocked) toast({ title: "Test email blocked", description: data.blockedReason ?? "Resolve validation errors first.", variant: "destructive" });
      else toast({ title: "Send failed", description: data.error, variant: "destructive" });
    },
    onError: (e: any) => { setEmailResult({ ok: false, error: e.message }); toast({ title: "Send failed", description: e.message, variant: "destructive" }); },
  });

  const allSet        = status?.configured === true;
  const isValidating  = validateMutation.isPending;
  const isSaving      = updateConfigMutation.isPending;
  const overallStatus: OverallStatus = validationResult?.overallStatus ?? "not_checked";
  const checkedAt     = validationResult?.checkedAt ?? null;

  const validatedMailboxCount = validationResult?.mailboxes?.filter(m => m.status === "pass").length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Microsoft 365</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            OAuth2 Client Credentials — Microsoft Graph API — Multi-mailbox email delivery
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isValidating
            ? <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />Validating…
              </Badge>
            : <OverallStatusBadge status={overallStatus} />
          }
          <Button variant="outline" size="icon"
            onClick={() => validateMutation.mutate()}
            disabled={isValidating || isSaving}
            data-testid="button-refresh-graph-status"
            title="Re-run live validation against Microsoft Graph API">
            <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Setup required banner ── */}
      {!allSet && !statusLoading && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>To enable email delivery through Microsoft 365, complete the Azure App Registration:</p>
            <ol className="list-decimal list-inside space-y-1.5 ml-1">
              <li>Sign in to <strong className="text-foreground">portal.azure.com</strong> → Azure Active Directory → App Registrations</li>
              <li>Click <strong className="text-foreground">New Registration</strong>. Name it <em>DriverHub 360 Email</em>, leave redirect URI blank.</li>
              <li>Copy the <strong className="text-foreground">Application (client) ID</strong> → set as <code className="bg-muted px-1 rounded">MICROSOFT_CLIENT_ID</code></li>
              <li>Copy the <strong className="text-foreground">Directory (tenant) ID</strong> → set as <code className="bg-muted px-1 rounded">MICROSOFT_TENANT_ID</code></li>
              <li>Go to <em>Certificates &amp; Secrets</em> → New Client Secret → copy value → <code className="bg-muted px-1 rounded">MICROSOFT_CLIENT_SECRET</code></li>
              <li>Go to <em>API Permissions</em> → Add → Microsoft Graph → Application permissions → <strong className="text-foreground">Mail.Send</strong> → Grant admin consent</li>
              <li>Set <code className="bg-muted px-1 rounded">MICROSOFT_SENDER_EMAIL</code> to the shared mailbox SMTP address</li>
            </ol>
            <div className="flex items-center gap-1 text-xs pt-1">
              <ExternalLink className="h-3 w-3" />
              <a href="https://learn.microsoft.com/en-us/graph/api/user-sendmail" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                Microsoft Graph — sendMail API reference
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══ SECTION 1: Tenant Configuration ══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Tenant Configuration
          </CardTitle>
          <CardDescription>
            {checkedAt
              ? `Last validated: ${formatCheckedAt(checkedAt)}`
              : "Run validation to check current configuration status."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0 divide-y sm:divide-y-0">
            <div className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground font-medium">Auth Flow</span>
              <span className="text-sm text-right">{status?.authFlow ?? "OAuth2 Client Credentials"}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground font-medium">Permissions</span>
              <span className="text-sm font-mono text-right">{status?.permissions?.join(", ") ?? "Mail.Send"}</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 sm:border-t">
              <span className="text-sm text-muted-foreground font-medium">Tenant ID (MICROSOFT_TENANT_ID)</span>
              {status?.envStatus?.MICROSOFT_TENANT_ID
                ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
                : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 text-xs"><XCircle className="h-3 w-3" />Missing</Badge>
              }
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">Client ID (MICROSOFT_CLIENT_ID)</span>
              {status?.envStatus?.MICROSOFT_CLIENT_ID
                ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
                : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 text-xs"><XCircle className="h-3 w-3" />Missing</Badge>
              }
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">Client Secret</span>
              {status?.envStatus?.MICROSOFT_CLIENT_SECRET
                ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
                : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 text-xs"><XCircle className="h-3 w-3" />Missing</Badge>
              }
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">Primary Sender Mailbox</span>
              <span className="text-sm font-mono">
                {status?.senderEmail ?? <em className="text-muted-foreground not-italic">not set</em>}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">Mailbox Object ID</span>
              <span className="text-sm font-mono text-right">
                {status?.senderObjectId
                  ? status.senderObjectId
                  : <em className="text-muted-foreground not-italic text-xs">not set — email address used in API</em>}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">OAuth Status</span>
              <OverallStatusBadge status={overallStatus} />
            </div>
            <div className="py-2.5 flex items-center justify-between gap-3 sm:col-span-2 border-t">
              <span className="text-sm text-muted-foreground font-medium">Token Caching</span>
              <span className="text-sm text-right">In-process, auto-refreshes 30 s before expiry</span>
            </div>
            {status?.endpoint && (
              <div className="py-2.5 flex items-start justify-between gap-3 sm:col-span-2 border-t">
                <span className="text-sm text-muted-foreground font-medium shrink-0">API Endpoint</span>
                <span className="text-xs font-mono text-right break-all text-muted-foreground">{status.endpoint}</span>
              </div>
            )}
          </div>

          {/* Update credentials panel */}
          {canEdit && (
            <>
              {!showUpdateCreds && (
                <div className="pt-4 mt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => setShowUpdateCreds(true)}
                    data-testid="btn-open-update-creds">
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Update Credentials
                  </Button>
                </div>
              )}
              {showUpdateCreds && (
                <UpdateCredentialsPanel
                  onSaveConfig={values => updateConfigMutation.mutate(values)}
                  onCancel={() => setShowUpdateCreds(false)}
                  isSaving={isSaving}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ══ SECTION 2: Sender Mailboxes ══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                Sender Mailboxes
              </CardTitle>
              <CardDescription className="mt-1">
                Five sender profiles route email from different functional areas. Run validation to check each mailbox.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isValidating || isSaving
                ? <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />{isSaving ? "Saving…" : "Checking…"}</Badge>
                : <OverallStatusBadge status={overallStatus} />
              }
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mailbox table-style list */}
          <div className="divide-y">
            {validationResult?.mailboxes
              ? validationResult.mailboxes.map(m => (
                  <MailboxDetailCard
                    key={m.profile}
                    mailbox={m}
                    isSuperAdmin={canEdit}
                    onSaveMailbox={(p, e) => updateMailboxMutation.mutate({ profile: p, email: e })}
                    isSavingMailbox={updateMailboxMutation.isPending}
                  />
                ))
              : SENDER_PROFILES.map(({ profile, email, purpose }) => (
                  <div key={profile} className="flex items-start gap-3 py-3">
                    {isValidating
                      ? <Loader2 className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5 animate-spin" />
                      : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{profile}</p>
                        <code className="text-xs text-muted-foreground font-mono">{email}</code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{purpose}</p>
                    </div>
                    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">
                      {isValidating ? "Checking…" : "Not Checked"}
                    </Badge>
                  </div>
                ))
            }
          </div>

          {/* Validation checks (global, non-mailbox) */}
          {(validationResult?.checks?.length || !validationResult) && (
            <div className="border-t mt-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1">Integration Checks</p>
              <div className="divide-y">
                {validationResult
                  ? validationResult.checks.map(check => (
                      <IntegrationCheckRow
                        key={check.key}
                        check={check}
                        onSaveConfig={values => updateConfigMutation.mutate(values)}
                        isSuperAdmin={canEdit}
                        isSaving={isSaving}
                      />
                    ))
                  : STATIC_CHECKS.map(c => (
                      <div key={c.key} className="flex items-start gap-3 py-3">
                        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-none">{c.label}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.description}</p>
                        </div>
                        <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">
                          Not Checked
                        </Badge>
                      </div>
                    ))
                }
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══ SECTION 3: Microsoft Services ══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-muted-foreground" />
            Microsoft Services
          </CardTitle>
          <CardDescription>
            Services available through the current Microsoft Graph API permission set. Only Mail.Send is active — additional permissions must be granted in Azure AD.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MS_SERVICES.map(service => (
              <ServiceTile
                key={service.id}
                service={service}
                overallStatus={overallStatus}
                mailboxCount={validatedMailboxCount}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══ SECTION 4: Actions ══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Actions
          </CardTitle>
          <CardDescription>
            Run diagnostics, update configuration, and test connectivity for this Microsoft 365 integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action button row */}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => { setShowUpdateCreds(v => !v); setShowTestEmail(false); }}
                data-testid="btn-action-update-creds">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Update Credentials
              </Button>
            )}
            <Button variant="outline" size="sm"
              onClick={() => testConnMutation.mutate()}
              disabled={testConnMutation.isPending}
              data-testid="button-test-graph-connection">
              {testConnMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing…</>
                : <><Link2 className="h-3.5 w-3.5 mr-1.5" />Refresh Token</>
              }
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={isValidating || isSaving}
              data-testid="btn-action-validate">
              {isValidating
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Validating…</>
                : <><Play className="h-3.5 w-3.5 mr-1.5" />Validate Configuration</>
              }
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm"
                onClick={() => { setShowTestEmail(v => !v); setShowUpdateCreds(false); setEmailResult(null); }}
                data-testid="btn-action-test-email">
                <Send className="h-3.5 w-3.5 mr-1.5" />Test Email Delivery
              </Button>
            )}
          </div>

          {/* Token test result inline */}
          {connResult && (
            <div className={`flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
              connResult.ok
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`} data-testid="result-connection-test">
              {connResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{connResult.ok ? connResult.message : connResult.error}</span>
            </div>
          )}

          {/* Update credentials panel (actions version) */}
          {canEdit && showUpdateCreds && (
            <UpdateCredentialsPanel
              onSaveConfig={values => updateConfigMutation.mutate(values)}
              onCancel={() => setShowUpdateCreds(false)}
              isSaving={isSaving}
            />
          )}

          {/* Test email form */}
          {canEdit && showTestEmail && (
            <TestEmailForm
              validationResult={validationResult}
              onClose={() => { setShowTestEmail(false); setEmailResult(null); }}
              onTestEmail={opts => testEmailMutation.mutate(opts)}
              isPending={testEmailMutation.isPending}
              emailResult={emailResult}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Environment Secrets ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-muted-foreground" />
            Environment Secrets
          </CardTitle>
          <CardDescription>
            Required secrets stored in the Replit Secrets vault. Values are never exposed.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {status?.requiredVars
            ? status.requiredVars.map((name: string) => (
                <div key={name} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    <code className="text-sm font-mono">{name}</code>
                  </div>
                  {status.envStatus?.[name]
                    ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
                    : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 text-xs"><XCircle className="h-3 w-3" />Missing</Badge>
                  }
                </div>
              ))
            : ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_SENDER_EMAIL"].map(name => (
                <div key={name} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    <code className="text-sm font-mono">{name}</code>
                  </div>
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1 text-xs"><XCircle className="h-3 w-3" />Missing</Badge>
                </div>
              ))
          }
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              <code className="text-sm font-mono">MICROSOFT_SENDER_OBJECT_ID</code>
              <Badge variant="outline" className="text-xs text-muted-foreground">Optional</Badge>
            </div>
            {status?.envStatus?.MICROSOFT_SENDER_OBJECT_ID
              ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Configured</Badge>
              : <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs">Not Set</Badge>
            }
          </div>
        </CardContent>
      </Card>

      {/* ── Account Reports Integration ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileBarChart className="h-4 w-4 text-muted-foreground" />
            Account Reports Integration
          </CardTitle>
          <CardDescription>
            Account Reports email delivery is powered by this Microsoft 365 integration. The sender profiles below are used for automated report distribution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y">
            {SENDER_PROFILES.map(({ profile, email, purpose }) => {
              const mailboxResult = validationResult?.mailboxes?.find(m => m.profile === profile);
              return (
                <div key={profile} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{profile}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{purpose}</p>
                    <code className="text-xs text-muted-foreground font-mono">{email}</code>
                  </div>
                  {mailboxResult
                    ? <CheckStatusBadge status={mailboxResult.status} />
                    : <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">Not Checked</Badge>
                  }
                </div>
              );
            })}
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              View campaign configurations, schedules, and per-account delivery history in Account Reports.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/account-reports" data-testid="btn-open-account-reports">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Account Reports
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
