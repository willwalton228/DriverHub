import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Plus, ClipboardList, Clock, CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, User, MapPin, Building2, Car, DollarSign, CalendarDays,
  Shield, MessageSquare, Send, Check, ChevronsUpDown, X, Info, Megaphone, ExternalLink,
  Activity, Radio, CheckSquare, Search, TrendingUp, SlidersHorizontal, FilterX,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DialogDescription } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { CERT_LIAISON_VALUES, employmentTypeOptions } from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUEST_ORIGINS = [
  { value: "Luis Valdez",      label: "Luis Valdez" },
  { value: "Louis Pinargote",  label: "Louis Pinargote" },
  { value: "Susanne Beebe",    label: "Susanne Beebe" },
  { value: "Other",            label: "Other" },
];

const CAMPAIGN_TYPES = [
  { value: "launch",   label: "Launch" },
  { value: "service",  label: "Service" },
  { value: "sales",    label: "Sales" },
  { value: "auction",  label: "Auction" },
];

const URGENCY_OPTIONS = [
  { value: "5", label: "Critical" },
  { value: "3", label: "Normal" },
  { value: "1", label: "Maintenance / Back Up Role" },
];

const DRIVER_CLASSIFICATION_OPTIONS = [
  { value: "Employee",               label: "Employee" },
  { value: "Independent Contractor", label: "Independent Contractor" },
];

const DRIVER_TYPE_OPTIONS = [
  { value: "DriverDash",  label: "DriverDash" },
  { value: "DriverShift", label: "DriverShift" },
  { value: "Hybrid",      label: "Hybrid" },
];

const VEHICLE_LICENSE_CLASS_OPTIONS = [
  { value: "Passenger Vehicle",    label: "Passenger Vehicle" },
  { value: "Shuttle Van",          label: "Shuttle Van" },
  { value: "Cargo Van / Sprinter", label: "Cargo Van / Sprinter" },
  { value: "Box Truck",            label: "Box Truck" },
  { value: "Flatbed",              label: "Flatbed" },
  { value: "CDL-A",                label: "CDL-A" },
  { value: "CDL-B",                label: "CDL-B" },
  { value: "Other",                label: "Other" },
];

const SIGN_ON_BONUS_OPTIONS = [
  { value: "250_40_trips", label: "$250 / 40 Trips" },
  { value: "150_40_trips", label: "$150 / 40 Trips" },
  { value: "no_bonus",     label: "No Bonus" },
  { value: "other",        label: "Other" },
];

const RECRUITER_OPTIONS = [
  { value: "Chennell Tennant", label: "Chennell Tennant" },
  { value: "Other",            label: "Other" },
];

// ── Shared pill base (consistent with ActiveCampaignsList) ────────────────────
const PILL = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

// Approved urgency labels (source of truth: Recruiting Request Form).
// Keys 2 and 4 are retained as legacy fallbacks for any pre-existing records.
const URGENCY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: "Maintenance / Back Up Role", cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700" },
  2: { label: "Med-Low",                    cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800" },
  3: { label: "Normal",                     cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  4: { label: "High",                       cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800" },
  5: { label: "Critical",                   cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
};

const REQUEST_STATUS_CHIP: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  submitted:    { label: "Submitted",        icon: Clock,         cls: "bg-muted/60 text-muted-foreground border-border" },
  under_review: { label: "Pending Approval", icon: Eye,           cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  approved:     { label: "Approved",         icon: CheckCircle2,  cls: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" },
  rejected:     { label: "Rejected",         icon: XCircle,       cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
  in_progress:  { label: "In Progress",      icon: Activity,      cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" },
  ads_live:     { label: "Ads Live",         icon: Radio,         cls: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800" },
  completed:    { label: "Completed",        icon: CheckSquare,   cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800" },
};

// Alias for backward compat (toast labels)
const STATUS_META = REQUEST_STATUS_CHIP;

// ── Lifecycle progression steps ───────────────────────────────────────────────
const STATUS_STEPS: { key: string; short: string }[] = [
  { key: "submitted",    short: "Submitted" },
  { key: "under_review", short: "Review" },
  { key: "approved",     short: "Approved" },
  { key: "in_progress",  short: "In Progress" },
  { key: "ads_live",     short: "Ads Live" },
  { key: "completed",    short: "Completed" },
];

function getProgressStep(status: string): number {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

const ADMIN_ROLES = ["super_user", "super_admin", "recruiting_admin"];
const LEADERSHIP_ROLES = ["super_user", "super_admin", "root_super_admin", "admin", "corporate_admin", "manager", "recruiter", "recruiting_admin"];

// ── Safe date formatter ────────────────────────────────────────────────────────
function safeFormat(value: string | null | undefined, fmt: string, fallback = "—"): string {
  if (!value) return fallback;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

// ── Campaign label generator ──────────────────────────────────────────────────
// Format: "{City}, {ST} - {DealerID}"  with graceful fallbacks per UAT spec.
// NEVER produces null / undefined / malformed strings like ", FL -" or " - ".
function generateCampaignLabel(
  city: string | null | undefined,
  state: string | null | undefined,
  dealerId: string | null | undefined,
): string {
  const c = city?.trim()     || null;
  const s = state?.trim()    || null;
  const d = dealerId?.trim() || null;

  const location = [c, s].filter(Boolean).join(", ");

  if (location && d) return `${location} - ${d}`;
  if (location)      return location;
  if (d)             return d;
  return "";
}

// ── Form schema ───────────────────────────────────────────────────────────────

const requestSchema = z.object({
  requestOrigin:        z.string().min(1, "Request origin is required"),
  accountId:            z.string().optional(),
  dealershipName:       z.string().min(1, "Dealership / Account Name is required"),
  location:             z.string().min(1, "Campaign label is required — select a dealership with city/state and dealer ID on file"),
  campaignType:         z.string().min(1, "Campaign type is required"),
  urgency:              z.coerce.number({ invalid_type_error: "Urgency level is required" }).min(1, "Urgency level is required").max(5),
  address:              z.string().optional(),
  city:                 z.string().optional(),
  state:                z.string().optional(),
  zipCode:              z.string().optional(),
  network:              z.string().optional(),
  vehicleLicenseClass:  z.string().min(1, "Vehicle / license class is required"),
  programType:          z.string().min(1, "Driver type is required"),
  driverClassification: z.string().min(1, "Driver classification is required"),
  employmentType:       z.string().min(1, "Employment type is required"),
  targetDriverCount:    z.coerce
    .number({ invalid_type_error: "Must be a whole number greater than 0" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1 driver"),
  signOnBonusOption:    z.string().min(1, "Sign-on bonus selection is required"),
  signOnBonusNotes:     z.string().optional(),
  payRate:              z.coerce
    .number({ invalid_type_error: "Enter a valid dollar amount" })
    .positive("Pay rate must be greater than $0")
    .multipleOf(0.01, "Maximum 2 decimal places"),
  targetDate:           z.string().min(1, "Target fill date is required").refine(
    v => !isNaN(Date.parse(v)),
    { message: "Must be a valid date" }
  ),
  recruiter:            z.string().min(1, "Recruiter is required"),
  certLiaison:          z.string().min(1, "Cert liaison is required"),
  driverSchedule:       z.string().optional(),
  additionalComments:   z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.signOnBonusOption === "other" && !data.signOnBonusNotes?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please describe the bonus details",
      path: ["signOnBonusNotes"],
    });
  }
});
type RequestForm = z.infer<typeof requestSchema>;

type RequestSubmissionError = {
  message: string;
  referenceId?: string;
  retryable: boolean;
};

function createSubmissionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recruiting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const chip = REQUEST_STATUS_CHIP[status] ?? { label: status, cls: "bg-muted/60 text-muted-foreground border-border", icon: Clock };
  const Icon = chip.icon;
  return (
    <span className={`${PILL} gap-1 ${chip.cls}`}>
      <Icon className="h-3 w-3" />
      {chip.label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: number }) {
  const u = URGENCY_LABELS[urgency] ?? { label: String(urgency), cls: "bg-muted/60 text-muted-foreground border-border" };
  return <span className={`${PILL} ${u.cls}`}>{u.label}</span>;
}

// ── Lifecycle progress stepper (compact horizontal bar) ───────────────────────
function ProgressStepper({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">Rejected — request closed</span>
      </div>
    );
  }
  const currentStep = getProgressStep(status);
  return (
    <div className="flex items-center gap-0.5 mt-1.5" aria-label={`Progress: ${status}`}>
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx < currentStep;
        const current = idx === currentStep;
        return (
          <div key={step.key} className="flex items-center gap-0.5">
            <div
              title={step.short}
              className={`h-1.5 rounded-full transition-all ${
                done    ? "w-6 bg-primary"
                : current ? "w-6 bg-primary/50"
                : "w-4 bg-muted/50"
              }`}
            />
          </div>
        );
      })}
      <span className="ml-1.5 text-[10px] text-muted-foreground">
        {REQUEST_STATUS_CHIP[status]?.label || status}
      </span>
    </div>
  );
}

// ── Request detail card (expanded) ────────────────────────────────────────────

function ApprovalActionPanel({
  req,
  onStatusChange,
  panelLabel,
  showPendingReview,
}: {
  req: any;
  onStatusChange: (id: string, status: string, notes: string) => void;
  panelLabel: string;
  showPendingReview: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState(false);

  const handleAction = (status: string) => {
    if (status === "rejected" && !notes.trim()) {
      setNotesError(true);
      return;
    }
    setNotesError(false);
    onStatusChange(req.id, status, notes);
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{panelLabel}</p>

      <div className="space-y-1">
        <Textarea
          placeholder={`Notes${notesError ? "" : " (required for rejection)"}…`}
          value={notes}
          onChange={e => { setNotes(e.target.value); if (e.target.value.trim()) setNotesError(false); }}
          className={`text-sm min-h-[60px] ${notesError ? "border-destructive focus-visible:ring-destructive" : ""}`}
          data-testid={`textarea-review-notes-${req.id}`}
        />
        {notesError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            A reason is required when rejecting a request.
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {showPendingReview && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("under_review")}
            data-testid={`btn-status-under-review-${req.id}`}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Pending Approval
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => handleAction("approved")}
          data-testid={`btn-status-approve-${req.id}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => handleAction("rejected")}
          data-testid={`btn-status-reject-${req.id}`}
        >
          <XCircle className="h-3.5 w-3.5 mr-1.5" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ── Create Campaign panel (Ticket 38) ────────────────────────────────────────

function CreateCampaignPanel({ req }: { req: any }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState("");
  const [notes, setNotes] = useState("");
  const [recruiterError, setRecruiterError] = useState(false);

  const { data: recruiters = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/recruiters"],
    enabled: open,
  });

  const campaignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting/requests/${req.id}/create-campaign`, { recruiterId, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      setOpen(false);
      toast({
        title: "Campaign Created",
        description: "The recruiting campaign is now Active. The assigned recruiter has been notified.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create campaign", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!recruiterId) { setRecruiterError(true); return; }
    setRecruiterError(false);
    campaignMutation.mutate();
  };

  // Already has a campaign
  if (req.campaignRequisitionId) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 text-blue-800 dark:text-blue-300 text-sm">
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="font-medium">Campaign created</span>
        <span className="text-xs opacity-75 ml-1">ID: {req.campaignRequisitionId.slice(0, 8)}…</span>
        <a
          href={`/recruiting/requisitions/${req.campaignRequisitionId}`}
          className="ml-auto flex items-center gap-1 text-xs underline underline-offset-2"
          data-testid={`link-view-campaign-${req.id}`}
        >
          View Campaign <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Campaign</p>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          data-testid={`btn-create-campaign-${req.id}`}
        >
          <Megaphone className="h-3.5 w-3.5 mr-1.5" />
          Create Campaign
        </Button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Converts this approved request into a recruiting campaign and notifies the assigned recruiter.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Create Recruiting Campaign
            </DialogTitle>
            <DialogDescription>
              This will generate a requisition pre-populated from the approved request and notify the recruiter to begin posting.
            </DialogDescription>
          </DialogHeader>

          {/* Pre-populated summary */}
          <div className="rounded-md bg-muted/50 border border-border p-3 text-sm space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Auto-populated from request</p>
            {req.market && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{req.market}{req.marketCode ? ` (${req.marketCode})` : ""}</p>}
            {req.dealershipName && <p className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{req.dealershipName}</p>}
            {req.driverTypes?.length > 0 && <p className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-muted-foreground" />{req.driverTypes.join(", ")}</p>}
            {req.payRate && <p className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" />${Number(req.payRate).toFixed(2)}</p>}
            {req.targetDriverCount && <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />Target: {req.targetDriverCount} drivers</p>}
            {req.targetDate && <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />Fill by: {safeFormat(req.targetDate, "MMM d, yyyy")}</p>}
          </div>

          {/* Recruiter assignment */}
          <div className="space-y-1.5">
            <Label htmlFor="recruiter-select" className="text-sm font-medium flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              Assign Recruiter <span className="text-destructive">*</span>
            </Label>
            <Select value={recruiterId} onValueChange={v => { setRecruiterId(v); setRecruiterError(false); }}>
              <SelectTrigger id="recruiter-select" className={recruiterError ? "border-destructive" : ""} data-testid="select-recruiter">
                <SelectValue placeholder="Select a recruiter…" />
              </SelectTrigger>
              <SelectContent>
                {recruiters.length === 0 ? (
                  <SelectItem value="loading" disabled>Loading…</SelectItem>
                ) : recruiters.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}{r.email ? ` — ${r.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recruiterError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Please assign a recruiter before creating the campaign.
              </p>
            )}
          </div>

          {/* Optional campaign notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Campaign Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Any additional context for the recruiter…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[60px] text-sm"
              data-testid="textarea-campaign-notes"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={campaignMutation.isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={campaignMutation.isPending} data-testid="btn-confirm-create-campaign">
              {campaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Megaphone className="h-4 w-4 mr-1.5" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestDetail({
  req, isAdmin, onStatusChange,
}: {
  req: any;
  isAdmin: boolean;
  onStatusChange: (id: string, status: string, notes: string) => void;
}) {
  const driverTypeLabels = (req.driverTypes || []).map(
    (t: string) => DRIVER_TYPE_OPTIONS.find(o => o.value === t)?.label || t
  ).join(", ");

  const rows: [string, string | null | undefined][] = [
    ["Campaign Type",          (CAMPAIGN_TYPES.find(c => c.value === req.campaignType)?.label || req.campaignType)],
    ["Campaign",               req.location || null],
    ["Dealership / Account",   req.dealershipName],
    ["Account Address",        (() => { const parts: string[] = []; if (req.address) parts.push(req.address); const citySt = req.city && req.state ? `${req.city}, ${req.state}` : req.city || req.state || ""; const line2 = [citySt, req.zipCode].filter(Boolean).join(" "); if (line2) parts.push(line2); return parts.join(", ") || null; })()],
    ["Network",                req.network || null],
    ["Vehicle / License Class", req.vehicleLicenseClass || null],
    ["Driver Type",            (() => { const v = req.programType || req.driverType; return v ? (DRIVER_TYPE_OPTIONS.find(o => o.value === v)?.label || v) : null; })()],
    ["Driver Classification",  req.driverClassification || null],
    ["Employment Type",        req.employmentType || null],
    ["Target Driver Count",    req.targetDriverCount?.toString()],
    ["Pay / Shift Rate",       req.payRate ? `$${Number(req.payRate).toFixed(2)}` : null],
    ["Sign-On Bonus",          req.signOnBonusOption ? (req.signOnBonusOption === "no_bonus" ? "No Bonus" : req.signOnBonusOption.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())) : "—"],
    ["Target Date",            req.targetDate ? safeFormat(req.targetDate, "MMM d, yyyy") : null],
    ["Recruiter",              req.recruiter],
    ["Cert Liaison",           req.certLiaison],
    ["Driver Schedule",        req.driverSchedule],
    ["Additional Comments",    req.additionalComments],
  ];

  // Approval decision summary (when finalized)
  const isFinalized = req.approvalStatus === "approved" || req.approvalStatus === "rejected";
  const isApproved  = req.approvalStatus === "approved";

  return (
    <div className="space-y-4 pt-2">
      {/* Approval decision banner */}
      {isFinalized && (
        <div className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-sm ${
          isApproved
            ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-800 dark:text-green-300"
            : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-800 dark:text-red-300"
        }`}>
          {isApproved
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div className="space-y-0.5">
            <p className="font-semibold">{isApproved ? "Approved" : "Rejected"} by {req.approvedBy}</p>
            {req.approvedAt && (
              <p className="text-xs opacity-75">{safeFormat(req.approvedAt, "MMM d, yyyy 'at' h:mm a")}</p>
            )}
            {req.approvalNotes && (
              <p className="text-xs mt-1 italic">"{req.approvalNotes}"</p>
            )}
          </div>
        </div>
      )}

      {/* Field detail grid */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, val]) => val ? (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground mt-0.5">{val}</dd>
          </div>
        ) : null)}
      </dl>

      {/* Intermediate review history (if not the final approval record) */}
      {req.reviewedBy && !isFinalized && (
        <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-0.5">
          <p>Last updated by <strong>{req.reviewedBy}</strong> on {safeFormat(req.reviewedAt, "MMM d, yyyy")}</p>
          {req.reviewNotes && <p className="italic">"{req.reviewNotes}"</p>}
        </div>
      )}

      {/* Admin action panels — only for non-terminal statuses */}
      {isAdmin && req.requestStatus === "submitted" && (
        <ApprovalActionPanel
          req={req}
          onStatusChange={onStatusChange}
          panelLabel="COO Approval Action"
          showPendingReview={true}
        />
      )}

      {isAdmin && req.requestStatus === "under_review" && (
        <ApprovalActionPanel
          req={req}
          onStatusChange={onStatusChange}
          panelLabel="Final Approval Decision"
          showPendingReview={false}
        />
      )}

      {/* Campaign creation / link — shown on approved requests for admins */}
      {isAdmin && req.requestStatus === "approved" && (
        <CreateCampaignPanel req={req} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface RecruitingRequestsTabProps {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  initialExpandId?: string | null;
  prefillData?: Record<string, any> | null;
  clonedFromCampaignId?: string | null;
}

export function RecruitingRequestsTab({ externalOpen, onExternalOpenChange, initialExpandId, prefillData, clonedFromCampaignId }: RecruitingRequestsTabProps = {}) {
  const { user } = useAuth();
  const { toast }  = useToast();
  const [internalOpen, setInternalOpen] = useState(false);

  const formOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  function setFormOpen(open: boolean) {
    if (externalOpen !== undefined && onExternalOpenChange) {
      onExternalOpenChange(open);
    } else {
      setInternalOpen(open);
    }
  }
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandId ?? null);

  // Deep-link support: auto-expand a specific request when navigated to via
  // /recruiting/requests/:id (e.g. from the pending-approval alert).
  useEffect(() => {
    if (initialExpandId) {
      setExpandedId(initialExpandId);
    }
  }, [initialExpandId]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [driverTypeFilter, setDriverTypeFilter] = useState("all");

  const isAdmin = ADMIN_ROLES.includes((user as any)?.role || "");

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests"],
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const [accountSearch, setAccountSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [submissionError, setSubmissionError] = useState<RequestSubmissionError | null>(null);
  const submissionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(accountSearch), 300);
    return () => clearTimeout(t);
  }, [accountSearch]);

  const {
    data: accountResults = [],
    isLoading: accountsLoading,
    isError: accountsError,
    refetch: refetchAccounts,
  } = useQuery<any[]>({
    queryKey: ["/api/accounts/search", debouncedSearch],
    queryFn: async () => {
      const response = await fetch(
        `/api/accounts/search?q=${encodeURIComponent(debouncedSearch)}&limit=500`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Unable to load account discovery data.");
      return response.json();
    },
    enabled: accountPopoverOpen,
    staleTime: 30_000,
  });

  const form = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      requestOrigin:        "",
      accountId:            "",
      dealershipName:       "",
      location:             "",
      campaignType:         "",
      urgency:              3,
      address:              "",
      city:                 "",
      state:                "",
      zipCode:              "",
      network:              "",
      vehicleLicenseClass:  "",
      programType:          "",
      driverClassification: "",
      employmentType:       "",
      targetDriverCount:    "",
      signOnBonusOption:    "",
      signOnBonusNotes:     "",
      payRate:              "",
      targetDate:           "",
      recruiter:            "",
      certLiaison:          "",
      driverSchedule:       "",
      additionalComments:   "",
    },
  });

  const watchedBonusOption = form.watch("signOnBonusOption");

  // Clear notes when the user switches away from "other" so stale data doesn't persist
  useEffect(() => {
    if (watchedBonusOption !== "other") {
      form.setValue("signOnBonusNotes", "");
    }
  }, [watchedBonusOption, form]);

  // When the form opens with prefill data (clone flow), populate all fields.
  // Deliberately excludes lifecycle dates (per clone flow — user must set new dates).
  useEffect(() => {
    if (!formOpen || !prefillData) return;
    const p = prefillData;
    const fields: Array<[keyof RequestForm, any]> = [
      ["requestOrigin",        p.requestOrigin        || ""],
      ["dealershipName",       p.dealershipName        || ""],
      ["address",              p.address               || ""],
      ["city",                 p.city                  || ""],
      ["state",                p.state                 || ""],
      ["zipCode",              p.zipCode               || ""],
      ["network",              p.network               || ""],
      ["location",             p.location              || p.dealershipName || ""],
      ["campaignType",         p.campaignType          || ""],
      ["urgency",              p.urgency               ?? 3],
      ["vehicleLicenseClass",  p.vehicleLicenseClass   || ""],
      ["driverType",           p.driverType            || ""],
      ["driverClassification", p.driverClassification  || ""],
      ["employmentType",       p.employmentType        || ""],
      ["targetDriverCount",    p.targetDriverCount != null ? String(p.targetDriverCount) : ""],
      ["signOnBonusOption",    p.signOnBonusOption     || ""],
      ["signOnBonusNotes",     p.signOnBonusNotes      || ""],
      ["payRate",              p.payRate != null ? String(p.payRate) : ""],
      ["recruiter",            p.recruiter             || ""],
      ["certLiaison",          p.certLiaison           || ""],
      ["driverSchedule",       p.driverSchedule        || ""],
      ["additionalComments",   p.additionalComments    || ""],
      ["accountId",            p.accountId             || ""],
      ["targetDate",           ""],   // intentionally blank — user must set new date
    ];
    fields.forEach(([name, val]) => form.setValue(name, val));
  }, [formOpen, prefillData]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitMutation = useMutation({
    mutationFn: (data: RequestForm) => {
      submissionKeyRef.current ??= createSubmissionKey();
      return apiRequest("POST", "/api/recruiting/requests", {
        ...data,
        // Include clone linkage when this request was initiated from a closed campaign
        ...(clonedFromCampaignId ? { clonedFromCampaignId } : {}),
      }, {
        headers: { "X-Idempotency-Key": submissionKeyRef.current },
      });
    },
    onMutate: () => {
      setSubmissionError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      toast({
        title: "Request submitted",
        description: clonedFromCampaignId
          ? "Cloned request submitted. The COO has been notified for approval."
          : "The COO has been notified for approval.",
      });
      setFormOpen(false);
      form.reset();
      setSelectedAccount(null);
      setAccountSearch("");
      setSubmissionError(null);
      submissionKeyRef.current = null;
    },
    onError: (error: any) => {
      const fieldErrors = error?.fieldErrors || {};
      Object.entries(fieldErrors).forEach(([field, message]) => {
        form.setError(field as keyof RequestForm, {
          type: "server",
          message: String(message),
        });
      });

      const retryable = !error?.status || error?.retryable === true;
      const reference = error?.referenceId ? ` Reference: ${error.referenceId}.` : "";
      const message = error?.message || "We couldn't submit this request. Your entries are still here.";
      const errorState = { message: `${message}${reference}`, referenceId: error?.referenceId, retryable };
      setSubmissionError(errorState);

      toast({
        title: error?.category === "validation" ? "Review the highlighted fields" : "Request not submitted",
        description: errorState.message,
        variant: "destructive",
        ...(retryable ? {
          action: (
            <ToastAction
              altText="Retry recruiting request submission"
              onClick={() => form.handleSubmit(data => submitMutation.mutate(data))()}
            >
              Retry
            </ToastAction>
          ),
        } : {}),
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, requestStatus, reviewNotes }: { id: string; requestStatus: string; reviewNotes: string }) =>
      apiRequest("PATCH", `/api/recruiting/requests/${id}/status`, { requestStatus, reviewNotes }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      const label = STATUS_META[variables.requestStatus]?.label || variables.requestStatus;
      toast({
        title: `Request ${label}`,
        description: variables.requestStatus === "approved"
          ? "The submitter has been notified. Recruiting execution can begin."
          : variables.requestStatus === "rejected"
          ? "The submitter has been notified with the rejection reason."
          : undefined,
      });
    },
    onError: (err: any) => {
      const msg = err?.message || "Update failed";
      toast({ title: "Action failed", description: msg, variant: "destructive" });
    },
  });

  const progressMutation = useMutation({
    mutationFn: ({ id, requestStatus, notes }: { id: string; requestStatus: string; notes?: string }) =>
      apiRequest("PATCH", `/api/recruiting/requests/${id}/progress`, { requestStatus, notes }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      const label = STATUS_META[variables.requestStatus]?.label || variables.requestStatus;
      toast({ title: `Request advanced to: ${label}` });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  // ── Derived state ────────────────────────────────────────────────────────────

  const uniqueLocations = useMemo(() =>
    Array.from(new Set(requests.map((r: any) => r.location || r.market).filter(Boolean))).sort() as string[],
    [requests]);

  const uniqueDriverTypes = useMemo(() =>
    Array.from(new Set(requests.map((r: any) => r.programType || r.driverType).filter(Boolean))).sort() as string[],
    [requests]);

  const filtered = useMemo(() => requests.filter((r: any) => {
    if (statusFilter !== "all" && r.requestStatus !== statusFilter) return false;
    if (urgencyFilter !== "all" && String(r.urgency) !== urgencyFilter) return false;
    if (locationFilter !== "all" && (r.location || r.market || "") !== locationFilter) return false;
    if (driverTypeFilter !== "all" && (r.programType || r.driverType || "") !== driverTypeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [r.dealershipName, r.location, r.submittedByName, r.market, r.recruiter]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [requests, statusFilter, urgencyFilter, locationFilter, driverTypeFilter, search]);

  // ── Counts ───────────────────────────────────────────────────────────────────

  const counts = {
    all:          requests.length,
    submitted:    requests.filter((r: any) => r.requestStatus === "submitted").length,
    under_review: requests.filter((r: any) => r.requestStatus === "under_review").length,
    approved:     requests.filter((r: any) => r.requestStatus === "approved").length,
    rejected:     requests.filter((r: any) => r.requestStatus === "rejected").length,
    in_progress:  requests.filter((r: any) => r.requestStatus === "in_progress").length,
    ads_live:     requests.filter((r: any) => r.requestStatus === "ads_live").length,
    completed:    requests.filter((r: any) => r.requestStatus === "completed").length,
  };

  const kpi = {
    total:         requests.length,
    pendingReview: counts.submitted + counts.under_review,
    active:        counts.approved + counts.in_progress + counts.ads_live,
    critical:      requests.filter((r: any) => r.urgency === 5).length,
  };

  const hasActiveFilters = !!(search || urgencyFilter !== "all" || locationFilter !== "all" || driverTypeFilter !== "all");
  const isLeadership = LEADERSHIP_ROLES.includes((user as any)?.role || "");

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Recruiting Requests</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Internal intake form — submitted requests trigger COO approval workflow
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} data-testid="btn-new-recruiting-request">
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "Total Requests",  value: kpi.total,         icon: ClipboardList, desc: "all time" },
          { label: "Pending Review",  value: kpi.pendingReview, icon: Clock,         desc: "awaiting approval" },
          { label: "Active",          value: kpi.active,        icon: TrendingUp,    desc: "approved or in-flight" },
          { label: "Critical",        value: kpi.critical,      icon: AlertTriangle, desc: "urgency level 5" },
        ] as { label: string; value: number; icon: any; desc: string }[]).map(({ label, value, icon: Icon, desc }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{desc}</p>
                </div>
                <Icon className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by dealership, location…"
            className="pl-8 h-9 text-sm"
            data-testid="input-request-search"
          />
        </div>
        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
          <SelectTrigger className="h-9 w-[130px] text-sm" data-testid="select-urgency-filter">
            <SelectValue placeholder="Urgency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgencies</SelectItem>
            {([5,3,1] as number[]).map(u => (
              <SelectItem key={u} value={String(u)}>
                {URGENCY_LABELS[u]?.label || `Urgency ${u}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {uniqueLocations.length > 0 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="select-location-filter">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {uniqueLocations.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {uniqueDriverTypes.length > 0 && (
          <Select value={driverTypeFilter} onValueChange={setDriverTypeFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm" data-testid="select-driver-type-filter">
              <SelectValue placeholder="Driver Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Driver Types</SelectItem>
              {uniqueDriverTypes.map(dt => (
                <SelectItem key={dt} value={dt}>{dt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setSearch(""); setUrgencyFilter("all"); setLocationFilter("all"); setDriverTypeFilter("all"); }}
            data-testid="btn-clear-filters"
          >
            <FilterX className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* ── Status tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          ["all",          "All",              counts.all],
          ["submitted",    "Submitted",        counts.submitted],
          ["under_review", "Pending Approval", counts.under_review],
          ["approved",     "Approved",         counts.approved],
          ["in_progress",  "In Progress",      counts.in_progress],
          ["ads_live",     "Ads Live",         counts.ads_live],
          ["completed",    "Completed",        counts.completed],
          ["rejected",     "Rejected",         counts.rejected],
        ] as [string, string, number][]).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            data-testid={`btn-filter-${val}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
              statusFilter === val
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {label}
            <span className={`text-[10px] tabular-nums ${statusFilter === val ? "opacity-80" : "opacity-60"}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-muted-foreground">No requests found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {statusFilter === "all" ? "Submit a new recruiting request to get started." : `No ${statusFilter.replace("_", " ")} requests.`}
              </p>
            </div>
            {statusFilter === "all" && (
              <Button size="sm" onClick={() => setFormOpen(true)} data-testid="btn-empty-new-request">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Request
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => {
            const isExpanded = expandedId === req.id;
            const campaignLabel = CAMPAIGN_TYPES.find(c => c.value === req.campaignType)?.label || req.campaignType;
            return (
              <Card key={req.id} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  data-testid={`btn-expand-request-${req.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{campaignLabel} Campaign</span>
                          <StatusBadge status={req.requestStatus} />
                          <UrgencyBadge urgency={req.urgency} />
                          {req.campaignRequisitionId && (
                            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              <Megaphone className="h-3 w-3" />
                              Campaign Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                          {req.submittedByName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {req.submittedByName}
                            </span>
                          )}
                          {req.market && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {req.market}{req.marketCode ? ` (${req.marketCode})` : ""}
                            </span>
                          )}
                          {req.dealershipName && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {req.dealershipName}
                            </span>
                          )}
                          {req.targetDriverCount && (
                            <span className="flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              {req.targetDriverCount} drivers
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {safeFormat(req.submittedAt, "MMM d, yyyy h:mm a")}
                          </span>
                        </div>
                        <ProgressStepper status={req.requestStatus} />
                      </div>
                      <div className="shrink-0 text-muted-foreground/40 mt-0.5">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardContent>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50 px-4 pb-4">
                    <RequestDetail
                      req={req}
                      isAdmin={isAdmin}
                      onStatusChange={(id, requestStatus, reviewNotes) =>
                        statusMutation.mutate({ id, requestStatus, reviewNotes })
                      }
                    />
                    {/* Progress advancement — for leadership on active requests */}
                    {isLeadership && ["approved","in_progress","ads_live"].includes(req.requestStatus) && (
                      <div className="border-t border-border pt-3 mt-1 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Advance Progress
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {req.requestStatus === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => progressMutation.mutate({ id: req.id, requestStatus: "in_progress" })}
                              disabled={progressMutation.isPending}
                              data-testid={`btn-progress-in-progress-${req.id}`}
                            >
                              <Activity className="h-3.5 w-3.5 mr-1.5" />
                              Mark In Progress
                            </Button>
                          )}
                          {req.requestStatus === "in_progress" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => progressMutation.mutate({ id: req.id, requestStatus: "ads_live" })}
                              disabled={progressMutation.isPending}
                              data-testid={`btn-progress-ads-live-${req.id}`}
                            >
                              <Radio className="h-3.5 w-3.5 mr-1.5" />
                              Mark Ads Live
                            </Button>
                          )}
                          {req.requestStatus === "ads_live" && (
                            <Button
                              size="sm"
                              onClick={() => progressMutation.mutate({ id: req.id, requestStatus: "completed" })}
                              disabled={progressMutation.isPending}
                              data-testid={`btn-progress-completed-${req.id}`}
                            >
                              <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                              Mark Completed
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── New Request Dialog ─────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={open => {
        setFormOpen(open);
        if (!open) {
          form.reset();
          setSelectedAccount(null);
          setAccountSearch("");
          setSubmissionError(null);
          submissionKeyRef.current = null;
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {clonedFromCampaignId ? "Clone as New Recruiting Request" : "New Recruiting Request"}
            </DialogTitle>
            <DialogDescription>
              {clonedFromCampaignId
                ? "Fields have been pre-populated from the closed campaign. Review, update as needed, then submit."
                : "Complete the form below. The COO will be notified for approval."}
            </DialogDescription>
          </DialogHeader>

          {/* Clone origin banner */}
          {clonedFromCampaignId && (
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10 px-3 py-2 flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-blue-800 dark:text-blue-300">
                Cloned from campaign <span className="font-mono text-xs">{clonedFromCampaignId}</span>.
                A new Request ID will be assigned on submission.
              </span>
            </div>
          )}

          {submissionError && (
            <div
              className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm"
              role="alert"
              data-testid="recruiting-request-submission-error"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-destructive">Your request was not submitted</p>
                <p className="mt-0.5 text-muted-foreground">{submissionError.message}</p>
              </div>
              {submissionError.retryable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => form.handleSubmit(data => submitMutation.mutate(data))()}
                  disabled={submitMutation.isPending}
                  data-testid="btn-retry-recruiting-request"
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(data => submitMutation.mutate(data))}
              className="space-y-5"
            >
              {/* ── Section: Request Info ── */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Request Info
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Request Origin */}
                <FormField
                  control={form.control}
                  name="requestOrigin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Request Origin *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-request-origin">
                            <SelectValue placeholder="Select origin…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REQUEST_ORIGINS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 4. Campaign Type */}
                <FormField
                  control={form.control}
                  name="campaignType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-campaign-type">
                            <SelectValue placeholder="Select type…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CAMPAIGN_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 5. Urgency Level */}
                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency Level *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-urgency">
                            <SelectValue placeholder="Select urgency…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {URGENCY_OPTIONS.map(u => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* ── Section: Account & Campaign ── */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Account & Campaign
              </p>

              {/* 2. Dealership / Account Name — searchable combobox */}
              <FormField
                control={form.control}
                name="dealershipName"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Dealership / Account Name *</FormLabel>
                    <div className="flex gap-2">
                      <Popover open={accountPopoverOpen} onOpenChange={open => {
                        setAccountPopoverOpen(open);
                        if (!open) setAccountSearch("");
                      }}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              data-testid="select-dealership"
                              className={cn(
                                "flex-1 justify-between font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <span className="truncate">
                                {field.value || "Search dealership or account…"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search active accounts…"
                              value={accountSearch}
                              onValueChange={setAccountSearch}
                              data-testid="input-dealership-search"
                            />
                            <CommandList
                              className="max-h-[400px]"
                              onWheel={(e) => e.stopPropagation()}
                            >
                              {accountsLoading ? (
                                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Searching accounts…
                                </div>
                              ) : accountsError ? (
                                <div className="flex flex-col items-center gap-2 py-6 text-sm text-destructive text-center px-4">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>Account discovery is unavailable.</span>
                                  <Button type="button" variant="outline" size="sm" onClick={() => refetchAccounts()}>
                                    Retry
                                  </Button>
                                </div>
                              ) : accountResults.length === 0 ? (
                                <CommandEmpty>
                                  {debouncedSearch
                                    ? `No active accounts match "${debouncedSearch}"`
                                    : "No active accounts found"}
                                </CommandEmpty>
                              ) : (
                                <CommandGroup heading={`${accountResults.length} account${accountResults.length !== 1 ? "s" : ""} found`}>
                                  {accountResults.map((acct: any) => {
                                    // Campaign label: "City, ST - DealerID" (new format)
                                    const campaignLabel = generateCampaignLabel(acct.city, acct.state, acct.dealerId);

                                    // Compute specific missing-field warnings
                                    const missingParts: string[] = [];
                                    if (!acct.city && !acct.state) missingParts.push("city/state");
                                    if (!acct.dealerId)            missingParts.push("dealer ID");

                                    const isSelected = field.value === acct.name;
                                    return (
                                      <CommandItem
                                        key={acct.id}
                                        value={acct.name}
                                        onSelect={() => {
                                          setSelectedAccount(acct);
                                          field.onChange(acct.name);
                                          form.setValue("accountId", acct.id);
                                          form.setValue("location", campaignLabel);
                                          form.setValue("address",  acct.address || "");
                                          form.setValue("city",     acct.city    || "");
                                          form.setValue("state",    acct.state   || "");
                                          form.setValue("zipCode",  acct.zip     || "");
                                          form.setValue("network",  acct.network || "");
                                          setAccountPopoverOpen(false);
                                          setAccountSearch("");
                                        }}
                                        data-testid={`option-account-${acct.id}`}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            isSelected ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className="font-medium truncate">{acct.name}</span>
                                          {campaignLabel ? (
                                            <span className="text-xs text-muted-foreground truncate">
                                              <MapPin className="inline h-3 w-3 mr-0.5 mb-0.5" />
                                              {campaignLabel}
                                            </span>
                                          ) : missingParts.length > 0 ? (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 truncate">
                                              Missing {missingParts.join(" and ")}
                                            </span>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      {/* Clear button — only shown when a dealership is selected */}
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-testid="btn-clear-dealership"
                          onClick={() => {
                            field.onChange("");
                            form.setValue("accountId", "");
                            form.setValue("location", "");
                            form.setValue("address",  "");
                            form.setValue("city",     "");
                            form.setValue("state",    "");
                            form.setValue("zipCode",  "");
                            form.setValue("network",  "");
                            setSelectedAccount(null);
                            setAccountSearch("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 3. Campaign Label / Location — auto-populated, manually editable */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Label / Location *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          {...field}
                          placeholder="e.g. Tampa, FL - 444"
                          className="pl-8"
                          data-testid="input-campaign"
                        />
                      </div>
                    </FormControl>
                    {/* Inline warning when selected account is missing data needed for label */}
                    {selectedAccount && !field.value && (() => {
                      const missing: string[] = [];
                      if (!selectedAccount.city && !selectedAccount.state) missing.push("city/state");
                      if (!selectedAccount.dealerId) missing.push("a dealer ID");
                      if (missing.length === 0) return null;
                      return (
                        <div className="flex items-start gap-1.5 mt-1 text-xs text-amber-700 dark:text-amber-400">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong>{selectedAccount.name}</strong> is missing {missing.join(" and ")}.
                            Label was partially generated — you may edit it manually.
                          </span>
                        </div>
                      );
                    })()}
                    {field.value && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-populated from account record. You may edit this label manually if needed.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Dealership / Account Address — read-only, auto-populated ── */}
              <FormField
                control={form.control}
                name="address"
                render={({ field: addrField }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Dealership / Account Address</FormLabel>
                    <FormControl>
                      <input type="hidden" {...addrField} />
                    </FormControl>
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field: cityField }) => (
                        <>
                          <input type="hidden" {...cityField} />
                          <FormField
                            control={form.control}
                            name="state"
                            render={({ field: stateField }) => (
                              <>
                                <input type="hidden" {...stateField} />
                                <FormField
                                  control={form.control}
                                  name="zipCode"
                                  render={({ field: zipField }) => {
                                    const line1 = addrField.value || "";
                                    const citySt = cityField.value && stateField.value
                                      ? `${cityField.value}, ${stateField.value}`
                                      : cityField.value || stateField.value || "";
                                    const line2 = [citySt, zipField.value].filter(Boolean).join(" ");
                                    const display = [line1, line2].filter(Boolean).join(", ");
                                    return (
                                      <>
                                        <input type="hidden" {...zipField} />
                                        <div
                                          className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm min-h-[38px] flex items-center"
                                          data-testid="display-account-address"
                                        >
                                          {display ? (
                                            <span>{display}</span>
                                          ) : (
                                            <span className="italic text-muted-foreground/60">
                                              {selectedAccount ? "No address on file" : "Select an account to auto-populate"}
                                            </span>
                                          )}
                                        </div>
                                      </>
                                    );
                                  }}
                                />
                              </>
                            )}
                          />
                        </>
                      )}
                    />
                  </FormItem>
                )}
              />

              {/* ── Network — read-only, auto-populated ── */}
              <FormField
                control={form.control}
                name="network"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Network</FormLabel>
                    <FormControl>
                      <input type="hidden" {...field} />
                    </FormControl>
                    <div
                      className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm min-h-[38px] flex items-center"
                      data-testid="display-network"
                    >
                      {field.value ? (
                        <span>{field.value}</span>
                      ) : (
                        <span className="italic text-muted-foreground/60">
                          {selectedAccount ? "No network on file" : "Select an account to auto-populate"}
                        </span>
                      )}
                    </div>
                  </FormItem>
                )}
              />

              <Separator />

              {/* ── Section: Driver Details ── */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5" /> Driver Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 6. Vehicle / License Class */}
                <FormField
                  control={form.control}
                  name="vehicleLicenseClass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle / License Class *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-vehicle-license-class">
                            <SelectValue placeholder="Select class…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VEHICLE_LICENSE_CLASS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 7. Driver Type */}
                <FormField
                  control={form.control}
                  name="programType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-driver-type">
                            <SelectValue placeholder="Select type…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DRIVER_TYPE_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 8. Driver Classification */}
                <FormField
                  control={form.control}
                  name="driverClassification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Classification *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-driver-classification">
                            <SelectValue placeholder="Select classification…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DRIVER_CLASSIFICATION_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 9. Employment Type */}
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-employment-type">
                            <SelectValue placeholder="Select type…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employmentTypeOptions.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 8. Target Number of Drivers */}
                <FormField
                  control={form.control}
                  name="targetDriverCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Number of Drivers *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="e.g. 10"
                          {...field}
                          data-testid="input-target-count"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 10. Driver Pay Rate */}
                <FormField
                  control={form.control}
                  name="payRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Pay Rate *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="0.00"
                            className="pl-8"
                            {...field}
                            data-testid="input-pay-rate"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 9. Sign-On Bonus */}
                <FormField
                  control={form.control}
                  name="signOnBonusOption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sign-On Bonus *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sign-on-bonus">
                            <SelectValue placeholder="Select bonus…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SIGN_ON_BONUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 9b. Sign-On Bonus Details — always in DOM, shown/hidden via CSS to avoid scroll jumps */}
                <div className={`col-span-2 ${watchedBonusOption === "other" ? "" : "hidden"}`}>
                  <FormField
                    control={form.control}
                    name="signOnBonusNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sign-On Bonus Details *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the bonus structure, amount, and any eligibility conditions…"
                            className="resize-none"
                            rows={3}
                            {...field}
                            data-testid="textarea-sign-on-bonus-notes"
                          />
                        </FormControl>
                        <FormDescription>
                          Required when "Other" is selected — provide enough detail for the recruiter to communicate the offer accurately.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Campaign Start Date is established automatically on approval. */}
                <FormField
                  control={form.control}
                  name="targetDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Fill Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-target-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 14. Driver Schedule */}
              <FormField
                control={form.control}
                name="driverSchedule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver Schedule</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Mon–Fri 7am–4pm, rotating weekends…"
                        {...field}
                        data-testid="input-driver-schedule"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* ── Section: Contacts ── */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Contacts
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 12. Recruiter */}
                <FormField
                  control={form.control}
                  name="recruiter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recruiter *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-recruiter">
                            <SelectValue placeholder="Select recruiter…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RECRUITER_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 13. Cert Liaison */}
                <FormField
                  control={form.control}
                  name="certLiaison"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cert Liaison *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-cert-liaison">
                            <SelectValue placeholder="Select liaison…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CERT_LIAISON_VALUES.map((name) => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* 15. Additional Comments */}
              <FormField
                control={form.control}
                name="additionalComments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Comments</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional context, requirements, or instructions…"
                        className="min-h-[90px]"
                        {...field}
                        data-testid="textarea-comments"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Submitting will notify the COO for approval. The request will be logged with status <strong>Submitted</strong>.</span>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormOpen(false);
                    form.reset();
                    setSelectedAccount(null);
                    setAccountSearch("");
                    setSubmissionError(null);
                    submissionKeyRef.current = null;
                  }}
                  data-testid="btn-cancel-request"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  data-testid="btn-submit-request"
                >
                  {submitMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" />Submit Request</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
