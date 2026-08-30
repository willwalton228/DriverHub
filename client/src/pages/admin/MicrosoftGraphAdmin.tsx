import { useState } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, XCircle, AlertTriangle, Mail, RefreshCw, Shield,
  Key, Link2, Send, Loader2, Info, ExternalLink, Server, Circle,
  Pencil, Save, X, ChevronRight,
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

// ── Field metadata ─────────────────────────────────────────────────────────────
const FIELD_META: Record<string, {
  label: string;
  placeholder: string;
  type: "text" | "password" | "email";
  hint: string;
  validate: (v: string) => string | null;
}> = {
  MICROSOFT_TENANT_ID: {
    label:       "Tenant ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:        "text",
    hint:        "Azure Active Directory (tenant) GUID",
    validate:    v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
  MICROSOFT_CLIENT_ID: {
    label:       "Client ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:        "text",
    hint:        "Azure App Registration Application (client) ID GUID",
    validate:    v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
  MICROSOFT_CLIENT_SECRET: {
    label:       "Client Secret",
    placeholder: "Enter new client secret value…",
    type:        "password",
    hint:        "Value from Azure App Registration → Certificates & Secrets. Never shown after save.",
    validate:    v => v.trim() ? null : "Client Secret cannot be blank",
  },
  MICROSOFT_SENDER_EMAIL: {
    label:       "Sender Email",
    placeholder: "reports@yourdomain.com",
    type:        "email",
    hint:        "Shared mailbox SMTP address used as the From address",
    validate:    v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
      ? null : "Must be a valid email address",
  },
  MICROSOFT_SENDER_OBJECT_ID: {
    label:       "Mailbox Object ID",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    type:        "text",
    hint:        "Azure AD object ID of the sender mailbox (fixes ErrorInvalidUser 404 for shared mailboxes whose UPN doesn't match their SMTP address)",
    validate:    v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())
      ? null : "Must be a valid GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
  },
};

// Field key → request body key
const FIELD_TO_BODY: Record<string, string> = {
  MICROSOFT_TENANT_ID:        "tenantId",
  MICROSOFT_CLIENT_ID:        "clientId",
  MICROSOFT_CLIENT_SECRET:    "clientSecret",
  MICROSOFT_SENDER_EMAIL:     "senderEmail",
  MICROSOFT_SENDER_OBJECT_ID: "senderObjectId",
};

// ── Inline edit form ───────────────────────────────────────────────────────────
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
  const [values, setValues]   = useState<Record<string, string>>(
    Object.fromEntries(editableFields.map(f => [f, ""])),
  );
  const [errors, setErrors]   = useState<Record<string, string>>({});

  function handleChange(field: string, val: string) {
    setValues(prev => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
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

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Only send fields that have values
    const payload: Record<string, string> = {};
    for (const field of editableFields) {
      if (values[field]?.trim()) {
        payload[FIELD_TO_BODY[field]] = values[field].trim();
      }
    }
    onSave(payload);
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Update Configuration
      </p>
      <p className="text-xs text-muted-foreground -mt-2">
        Only fill in the field(s) you want to change. Leave any field blank to keep its current value.
      </p>

      {editableFields.map(field => {
        const meta = FIELD_META[field];
        const error = errors[field];
        return (
          <div key={field} className="space-y-1.5">
            <Label className="text-sm font-medium" htmlFor={`edit-${field}`}>
              {meta.label}
            </Label>
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
            {error ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{meta.hint}</p>
            )}
          </div>
        );
      })}

      {/* Security note for secrets */}
      {editableFields.includes("MICROSOFT_CLIENT_SECRET") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Secret values are stored securely and are never displayed after save.</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          data-testid="btn-save-ms365-config"
        >
          {isSaving
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
            : <><Save className="h-3.5 w-3.5 mr-1.5" />Save &amp; Re-validate</>
          }
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          data-testid="btn-cancel-ms365-edit"
        >
          <X className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Environment secret row ─────────────────────────────────────────────────────
function SecretStatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
      <XCircle className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function EnvRow({ name, set }: { name: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Key className="h-3.5 w-3.5 text-muted-foreground" />
        <code className="text-sm font-mono">{name}</code>
      </div>
      <SecretStatusBadge ok={set} label={set ? "Configured" : "Missing"} />
    </div>
  );
}

// ── Overall status badge ───────────────────────────────────────────────────────
function OverallStatusBadge({ status }: { status: OverallStatus }) {
  if (status === "not_checked") {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 gap-1">
        <Circle className="h-3 w-3" />
        Not Checked
      </Badge>
    );
  }
  if (status === "fully_operational") {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Fully Operational
      </Badge>
    );
  }
  if (status === "partially_operational") {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Partially Operational
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
      <XCircle className="h-3 w-3" />
      Failed
    </Badge>
  );
}

// ── Per-check status icon ──────────────────────────────────────────────────────
function CheckStatusIcon({ status }: { status: ValidationStatus }) {
  if (status === "pass")    return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />;
  if (status === "fail")    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />;
}

// ── Per-check status badge ─────────────────────────────────────────────────────
function CheckStatusBadge({ status }: { status: ValidationStatus }) {
  if (status === "pass") {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs shrink-0">Pass</Badge>;
  }
  if (status === "fail") {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs shrink-0">Failed</Badge>;
  }
  if (status === "warning") {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs shrink-0">Warning</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">
      Not Checked
    </Badge>
  );
}

// ── Integration check row ──────────────────────────────────────────────────────
function IntegrationCheckRow({
  check,
  onSaveConfig,
  isSuperAdmin,
  isSaving,
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

  function handleSave(values: Record<string, string>) {
    onSaveConfig(values);
    setEditOpen(false);
  }

  return (
    <div className="py-3 space-y-1.5">
      <div className="flex items-start gap-3">
        <CheckStatusIcon status={check.status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{check.label}</p>
          {check.status === "not_checked" && (
            <p className="text-xs text-muted-foreground mt-0.5">Not yet checked.</p>
          )}
          {check.status === "pass" && (
            <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
          )}
        </div>
        <CheckStatusBadge status={check.status} />
      </div>

      {hasMessage && (
        <div className="ml-7 space-y-2">
          <p className="text-sm text-foreground/80">{check.message}</p>

          <div className="flex flex-wrap items-center gap-3">
            {hasTechDetail && (
              <button
                type="button"
                onClick={() => setDetailsOpen(v => !v)}
                data-testid={`btn-toggle-details-${check.key}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {detailsOpen ? "Hide Details" : "Details"}
              </button>
            )}

            {canEdit && !editOpen && (
              <>
                {hasTechDetail && <span className="text-muted-foreground/40 text-xs">·</span>}
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Configuration update required.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    data-testid={`btn-edit-config-${check.key}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit Configuration
                  </button>
                </div>
              </>
            )}
          </div>

          {hasTechDetail && detailsOpen && (
            <pre className="text-xs bg-muted/60 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground"
              data-testid={`technical-detail-${check.key}`}
            >
              {check.technicalError}
            </pre>
          )}

          {editOpen && (
            <InlineEditForm
              relatedFields={check.relatedFields}
              onSave={handleSave}
              onCancel={() => setEditOpen(false)}
              isSaving={isSaving}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Static check rows (before first validation) ────────────────────────────────
const STATIC_CHECKS: { key: string; label: string; description: string }[] = [
  { key: "secrets_present",   label: "Secrets Present",   description: "All required configuration values are present." },
  { key: "oauth_token_valid", label: "OAuth Token Valid",  description: "The Azure app credentials can acquire a Microsoft Graph access token." },
];

// ── Sender profiles (mirrors backend SENDER_PROFILES constant) ─────────────────
const SENDER_PROFILES = [
  { profile: "Reports",    email: "reports@driverondemand.co"    },
  { profile: "Data",       email: "data@driverondemand.co"       },
  { profile: "Support",    email: "support@driverondemand.co"    },
  { profile: "Dispatch",   email: "dispatch@driverondemand.co"   },
  { profile: "Recruiting", email: "recruiting@driverondemand.co" },
];

function StaticCheckRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">
        Not Checked
      </Badge>
    </div>
  );
}

// ── Per-mailbox inline email edit form ────────────────────────────────────────
function MailboxEmailEditForm({
  profile,
  currentEmail,
  onSave,
  onCancel,
  isSaving,
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

  function validate(v: string): string | null {
    if (!v.trim()) return `${profile} email cannot be blank.`;
    if (!EMAIL_RE.test(v.trim())) return "Must be a valid email address.";
    return null;
  }

  function handleSave() {
    const err = validate(value);
    if (err) { setError(err); return; }
    onSave(profile, value.trim());
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Update {profile} Mailbox Email
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`mailbox-edit-${profile}`} className="text-sm">
          {profile} Email
        </Label>
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
          ? <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />{error}
            </p>
          : <p className="text-xs text-muted-foreground">
              Must be a valid mailbox in the current Microsoft 365 tenant.
            </p>
        }
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          data-testid={`btn-save-mailbox-${profile.toLowerCase()}`}
        >
          {isSaving
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
            : <><Save className="h-3.5 w-3.5 mr-1.5" />Save &amp; Re-validate</>
          }
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          data-testid={`btn-cancel-mailbox-${profile.toLowerCase()}`}
        >
          <X className="h-3.5 w-3.5 mr-1.5" />Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Mailbox sub-check row ──────────────────────────────────────────────────────
function MailboxSubCheck({
  label,
  status,
}: {
  label: string;
  status: ValidationStatus;
}) {
  return (
    <div className="flex items-center gap-2">
      <CheckStatusIcon status={status} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <CheckStatusBadge status={status} />
    </div>
  );
}

// ── Mailbox card (one row per sender profile) ──────────────────────────────────
function MailboxCard({
  mailbox,
  isSuperAdmin,
  onSaveMailbox,
  isSavingMailbox,
}: {
  mailbox: MailboxResult;
  isSuperAdmin: boolean;
  onSaveMailbox: (profile: string, email: string) => void;
  isSavingMailbox: boolean;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);

  const isFail    = mailbox.status === "fail";
  const isWarning = mailbox.status === "warning";
  // Only show edit for outright failures (not just mailSend warning)
  const canEdit   = isSuperAdmin && isFail;

  return (
    <div className="py-3 space-y-2" data-testid={`mailbox-row-${mailbox.profile.toLowerCase()}`}>
      {/* Header row */}
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
          </div>
          {mailbox.status === "pass" && (
            <p className="text-xs text-muted-foreground mt-0.5">{mailbox.message}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Edit Configuration button — visible directly on the row for failed mailboxes */}
          {canEdit && !editOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid={`btn-edit-mailbox-${mailbox.profile.toLowerCase()}`}
              className="h-7 text-xs gap-1"
            >
              <Pencil className="h-3 w-3" />
              Edit Configuration
            </Button>
          )}
          {canEdit && editOpen && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(false)}
              data-testid={`btn-cancel-edit-mailbox-header-${mailbox.profile.toLowerCase()}`}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            data-testid={`btn-expand-mailbox-${mailbox.profile.toLowerCase()}`}
          >
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

      {/* Inline message for fail/warning */}
      {(isFail || isWarning) && mailbox.message && (
        <div className="ml-7 space-y-1.5">
          <p className="text-sm text-foreground/80">{mailbox.message}</p>

          {mailbox.technicalError && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setDetailsOpen(v => !v)}
                data-testid={`btn-toggle-details-mailbox-${mailbox.profile.toLowerCase()}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {detailsOpen ? "Hide Details" : "Details"}
              </button>
            </div>
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

      {/* Expanded sub-checks */}
      {expanded && (
        <div className="ml-7 space-y-2 pt-1">
          <MailboxSubCheck label="Mailbox Found"        status={mailbox.checks.found} />
          <MailboxSubCheck label="Mail-Enabled"         status={mailbox.checks.mailEnabled} />
          <MailboxSubCheck label="Mail.Send Permission" status={mailbox.checks.mailSend} />
          {mailbox.checks.mailSend === "warning" && (
            <p className="text-xs text-muted-foreground ml-6">
              Mail.Send is set as warning until confirmed by a test email send.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mailboxes section (live or placeholder) ────────────────────────────────────
function MailboxesSection({
  mailboxes,
  isSuperAdmin,
  onSaveMailbox,
  isSavingMailbox,
}: {
  mailboxes?: MailboxResult[];
  isSuperAdmin: boolean;
  onSaveMailbox: (profile: string, email: string) => void;
  isSavingMailbox: boolean;
}) {
  return (
    <div className="pt-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-2">
        Sender Mailboxes
      </p>
      <div className="divide-y">
        {mailboxes
          ? mailboxes.map(m => (
              <MailboxCard
                key={m.profile}
                mailbox={m}
                isSuperAdmin={isSuperAdmin}
                onSaveMailbox={onSaveMailbox}
                isSavingMailbox={isSavingMailbox}
              />
            ))
          : SENDER_PROFILES.map(({ profile, email }) => (
              <div key={profile} className="flex items-start gap-3 py-3">
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{profile} Mailbox</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{email}</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs shrink-0">
                  Not Checked
                </Badge>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── Standalone update config panel ────────────────────────────────────────────
const UPDATABLE_FIELDS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_SENDER_EMAIL",
  "MICROSOFT_SENDER_OBJECT_ID",
] as const;

function UpdateConfigPanel({
  onSaveConfig,
  isSaving,
}: {
  onSaveConfig: (values: Record<string, string>) => void;
  isSaving: boolean;
}) {
  const [selectedField, setSelectedField] = useState<string>("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = selectedField ? FIELD_META[selectedField] : null;

  function handleFieldChange(f: string) {
    setSelectedField(f);
    setValue("");
    setError(null);
  }

  function handleSave() {
    if (!selectedField || !meta) return;
    const err = meta.validate(value);
    if (err) { setError(err); return; }
    const bodyKey = FIELD_TO_BODY[selectedField];
    onSaveConfig({ [bodyKey]: value.trim() });
    setValue("");
    setSelectedField("");
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Update Configuration
        </CardTitle>
        <CardDescription>
          Update any credential or identifier stored in the database. The new value takes effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Field</Label>
          <Select value={selectedField} onValueChange={handleFieldChange} disabled={isSaving}>
            <SelectTrigger data-testid="select-config-field">
              <SelectValue placeholder="Choose a field to update…" />
            </SelectTrigger>
            <SelectContent>
              {UPDATABLE_FIELDS.map(f => (
                <SelectItem key={f} value={f}>
                  {FIELD_META[f].label}
                </SelectItem>
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

        <Button
          onClick={handleSave}
          disabled={!selectedField || !value.trim() || isSaving}
          data-testid="button-save-config"
        >
          {isSaving
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            : <><Save className="h-4 w-4 mr-2" />Save & Re-validate</>
          }
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MicrosoftGraphAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin, isRootSuperAdmin } = useAuth();

  const [testEmail,          setTestEmail]          = useState("");
  const [testSubject,        setTestSubject]        = useState("DriverHub Microsoft 365 Email Test");
  const [testMessage,        setTestMessage]        = useState("This is a test email from DriverHub using the selected sender mailbox.");
  const [selectedProfile,    setSelectedProfile]    = useState("Reports");
  const [connResult,       setConnResult]        = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [emailResult,      setEmailResult]       = useState<{
    ok: boolean;
    blocked?: boolean;
    blockedReason?: string;
    sentAt?: string;
    senderProfile?: string;
    message?: string;
    error?: string;
    technicalError?: string;
  } | null>(null);
  const [validationResult, setValidationResult]  = useState<ValidationResult | null>(null);

  // ── Environment status query ─────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/integrations/microsoft-graph/status"],
    queryFn:  () => fetch("/api/integrations/microsoft-graph/status").then(r => r.json()),
  });

  // ── Validation mutation ──────────────────────────────────────────────────────
  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/validate", {});
      return res.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
      refetchStatus();
    },
    onError: (e: any) => {
      toast({
        title: "Validation failed",
        description: e.message ?? "Could not reach the validation service.",
        variant: "destructive",
      });
    },
  });

  // ── Update config mutation ───────────────────────────────────────────────────
  const updateConfigMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/update-config", payload);
      return res.json() as Promise<{ ok: boolean; validationResult: ValidationResult }>;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setValidationResult(data.validationResult);
        refetchStatus();
        toast({
          title: "Configuration updated",
          description: "Settings saved. Validation ran automatically — review the results below.",
        });
      } else {
        toast({ title: "Update failed", description: "The server returned an error.", variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({
        title: "Configuration update failed",
        description: e.message ?? "Could not save the configuration.",
        variant: "destructive",
      });
    },
  });

  // ── Update per-mailbox email mutation ────────────────────────────────────────
  const updateMailboxMutation = useMutation({
    mutationFn: async ({ profile, email }: { profile: string; email: string }) => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/update-mailbox-config", { profile, email });
      return res.json() as Promise<{ ok: boolean; validationResult: ValidationResult }>;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setValidationResult(data.validationResult);
        refetchStatus();
        toast({
          title: "Mailbox updated",
          description: "Email address saved. Validation ran automatically — review the results below.",
        });
      } else {
        toast({ title: "Update failed", description: "The server returned an error.", variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({
        title: "Mailbox update failed",
        description: e.message ?? "Could not save the mailbox email.",
        variant: "destructive",
      });
    },
  });

  // ── Other mutations ──────────────────────────────────────────────────────────
  const testConnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/test-connection", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setConnResult(data);
      if (data.ok) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      setConnResult({ ok: false, error: e.message });
      toast({ title: "Connection test failed", description: e.message, variant: "destructive" });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/microsoft-graph/test-email", {
        to:            testEmail,
        subject:       testSubject,
        message:       testMessage,
        senderProfile: selectedProfile,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      // Propagate updated validation result to the checklist
      if (data.validationResult) {
        setValidationResult(data.validationResult);
        refetchStatus();
      }
      setEmailResult({
        ok:            data.ok,
        blocked:       data.blocked,
        blockedReason: data.blockedReason,
        sentAt:        data.sentAt,
        senderProfile: data.senderProfile,
        message:       data.message,
        error:         data.error,
        technicalError: data.technicalError,
      });
      if (data.ok) {
        toast({ title: "Test email sent", description: data.message });
      } else if (data.blocked) {
        toast({ title: "Send blocked", description: data.blockedReason, variant: "destructive" });
      } else {
        toast({ title: "Send failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      setEmailResult({ ok: false, error: e.message });
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    },
  });

  const allSet        = status?.configured === true;
  const isValidating  = validateMutation.isPending;
  const isSaving      = updateConfigMutation.isPending;
  const overallStatus = validationResult?.overallStatus ?? "not_checked";
  const checkedAt     = validationResult?.checkedAt ?? null;
  const canEdit       = isSuperAdmin || isRootSuperAdmin;

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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Microsoft 365 Integration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Microsoft Graph API — OAuth2 Client Credentials — Email Delivery
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => validateMutation.mutate()}
          disabled={isValidating || isSaving}
          data-testid="button-refresh-graph-status"
          title="Run integration validation"
        >
          <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ── Setup guide (shown when not configured) ── */}
      {!allSet && !statusLoading && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              Setup Required
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
              <li>Set <code className="bg-muted px-1 rounded">MICROSOFT_SENDER_EMAIL</code> to the shared mailbox SMTP address (e.g. <em>reports@yourdomain.com</em>)</li>
              <li><strong className="text-foreground">Shared mailbox only:</strong> If you see <em>ErrorInvalidUser (404)</em>, the mailbox UPN doesn't match its SMTP address. In Exchange Admin Center, open the mailbox and copy the object ID from the URL. Set it as <code className="bg-muted px-1 rounded">MICROSOFT_SENDER_OBJECT_ID</code> — this ID is used in the Graph API call instead of the email address.</li>
            </ol>
            <div className="flex items-center gap-1 text-xs pt-1">
              <ExternalLink className="h-3 w-3" />
              <a
                href="https://learn.microsoft.com/en-us/graph/api/user-sendmail"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                Microsoft Graph — sendMail API reference
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Update Configuration — Super Admin only ── */}
      {canEdit && (
        <UpdateConfigPanel
          onSaveConfig={values => updateConfigMutation.mutate(values)}
          isSaving={isSaving}
        />
      )}

      {/* ── Integration Status ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Integration Status
              </CardTitle>
              <CardDescription className="mt-1">
                {isSaving
                  ? "Saving configuration and re-running validation…"
                  : checkedAt
                    ? `Last checked: ${formatCheckedAt(checkedAt)}`
                    : "Click the refresh button to run validation."
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isValidating || isSaving
                ? (
                  <Badge variant="outline" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isSaving ? "Saving…" : "Checking…"}
                  </Badge>
                )
                : <OverallStatusBadge status={overallStatus} />
              }
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Global checks: Secrets Present + OAuth Token Valid */}
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
                  <StaticCheckRow key={c.key} label={c.label} description={c.description} />
                ))
            }
          </div>
          {/* Sender Mailboxes section */}
          <div className="border-t pt-2 mt-1">
            <MailboxesSection
              mailboxes={validationResult?.mailboxes}
              isSuperAdmin={canEdit}
              onSaveMailbox={(profile, email) => updateMailboxMutation.mutate({ profile, email })}
              isSavingMailbox={updateMailboxMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Environment Secrets ── */}
      <Card>
        <CardHeader>
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
                <EnvRow key={name} name={name} set={!!status.envStatus?.[name]} />
              ))
            : ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_SENDER_EMAIL"]
                .map(name => <EnvRow key={name} name={name} set={false} />)
          }
          <EnvRow
            name="MICROSOFT_SENDER_OBJECT_ID"
            set={!!status?.envStatus?.["MICROSOFT_SENDER_OBJECT_ID"]}
          />
        </CardContent>
      </Card>

      {/* ── Integration Details ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" />
            Integration Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-[160px_1fr] gap-y-2">
            <span className="text-muted-foreground font-medium">Auth flow</span>
            <span>{status?.authFlow ?? "OAuth2 Client Credentials (app-level)"}</span>
            <span className="text-muted-foreground font-medium">Permissions</span>
            <span>{status?.permissions?.join(", ") ?? "Mail.Send"}</span>
            <span className="text-muted-foreground font-medium">Sender mailbox</span>
            <span className="font-mono text-xs">{status?.senderEmail ?? <em className="text-muted-foreground">not set</em>}</span>
            <span className="text-muted-foreground font-medium">Mailbox Object ID</span>
            <span className="font-mono text-xs">
              {status?.senderObjectId
                ? status.senderObjectId
                : <em className="text-muted-foreground">not set (email address used in API URL)</em>}
            </span>
            <span className="text-muted-foreground font-medium">Token caching</span>
            <span>In-process, auto-refreshes 30 s before expiry</span>
            <span className="text-muted-foreground font-medium">API endpoint</span>
            <span className="font-mono text-xs break-all">{status?.endpoint ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Test OAuth Connection ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Test OAuth Connection
          </CardTitle>
          <CardDescription>
            Verify that the Azure App credentials can acquire a Microsoft Graph access token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => testConnMutation.mutate()}
            disabled={testConnMutation.isPending}
            variant="outline"
            data-testid="button-test-graph-connection"
          >
            {testConnMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing…</>
              : <><Server className="h-4 w-4 mr-2" />Test Token Acquisition</>
            }
          </Button>

          {connResult && (
            <div className={`flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
              connResult.ok
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            }`} data-testid="result-connection-test">
              {connResult.ok
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              }
              <span>{connResult.ok ? connResult.message : connResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Send Test Email — Super Admin only ── */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Send Test Email
            </CardTitle>
            <CardDescription>
              Validate the full pipeline by sending a real email through Microsoft Graph using the configured sender mailbox.
              Validation runs automatically before the send attempt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const PROFILES = ["Reports", "Data", "Support", "Dispatch", "Recruiting"];
              const selectedMailbox = validationResult?.mailboxes?.find(m => m.profile === selectedProfile);
              const mailboxBlocked  = selectedMailbox ? selectedMailbox.checks.found === "fail" || selectedMailbox.checks.mailEnabled === "fail" : false;

              return (
                <>
                  <div className="grid gap-3">
                    {/* ── Send Test From selector ── */}
                    <div className="space-y-1.5">
                      <Label htmlFor="test-email-from">Send Test From</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedProfile}
                          onValueChange={v => { setSelectedProfile(v); setEmailResult(null); }}
                          disabled={testEmailMutation.isPending}
                        >
                          <SelectTrigger id="test-email-from" className="w-48" data-testid="select-sender-profile">
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

                        {/* Inline mailbox status badge */}
                        {selectedMailbox && (
                          <div className="flex items-center gap-1.5 text-sm">
                            {selectedMailbox.status === "pass" ? (
                              <><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /><span className="text-green-700 dark:text-green-400">Verified</span></>
                            ) : selectedMailbox.status === "fail" ? (
                              <><XCircle className="h-4 w-4 text-destructive" /><span className="text-destructive">Not available</span></>
                            ) : (
                              <><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-amber-600 dark:text-amber-400">Not yet confirmed</span></>
                            )}
                          </div>
                        )}
                      </div>
                      {mailboxBlocked && (
                        <p className="text-xs text-destructive mt-1">
                          The {selectedProfile} mailbox failed verification — resolve the issue above before sending a test email from this profile.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="test-email-to">To</Label>
                      <Input
                        id="test-email-to"
                        type="email"
                        placeholder="recipient@example.com"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                        disabled={testEmailMutation.isPending}
                        data-testid="input-test-email-to"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="test-email-subject">Subject</Label>
                      <Input
                        id="test-email-subject"
                        value={testSubject}
                        onChange={e => setTestSubject(e.target.value)}
                        disabled={testEmailMutation.isPending}
                        data-testid="input-test-email-subject"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="test-email-body">Message Body</Label>
                      <Input
                        id="test-email-body"
                        value={testMessage}
                        onChange={e => setTestMessage(e.target.value)}
                        disabled={testEmailMutation.isPending}
                        data-testid="input-test-email-body"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => testEmailMutation.mutate()}
                    disabled={!testEmail || testEmailMutation.isPending || mailboxBlocked}
                    data-testid="button-send-test-email"
                  >
                    {testEmailMutation.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending from {selectedProfile}…</>
                      : <><Send className="h-4 w-4 mr-2" />Send Test from {selectedProfile}</>
                    }
                  </Button>
                </>
              );
            })()}

            {/* Result display */}
            {emailResult && (
              <div className="space-y-2" data-testid="result-email-test">
                {emailResult.ok ? (
                  <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-medium">{emailResult.message}</p>
                      {emailResult.sentAt && (
                        <p className="text-xs opacity-80">
                          Sent at: {new Date(emailResult.sentAt).toLocaleString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                            hour: "numeric", minute: "2-digit", hour12: true,
                            timeZoneName: "short",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : emailResult.blocked ? (
                  <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{emailResult.blockedReason ?? "Test email blocked — review the validation checklist above."}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-md px-4 py-3 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{emailResult.error ?? "Email send failed. Verify mailbox and permissions."}</span>
                    </div>
                    {emailResult.technicalError && (
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
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
