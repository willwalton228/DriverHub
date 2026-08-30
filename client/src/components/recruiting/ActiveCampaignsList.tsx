import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useListViewPrefs, saveScrollPosition, readScrollPosition } from "@/hooks/useListViewPrefs";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Rocket, DollarSign, Users, CalendarDays, Target, ClipboardList,
  CheckCircle2, XCircle, CircleX, Clock, AlertTriangle, ChevronRight, ChevronDown, ArrowLeft,
  MapPin, Briefcase, User, MessageSquare, FileText, TrendingUp,
  Shield, Info, Search, SlidersHorizontal,
  ArrowUpDown, ArrowUp, ArrowDown, FilterX, Pencil, MoreHorizontal, Archive, RotateCcw, Copy,
  UserPlus, ExternalLink, Trash2, Globe, Plus,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { differenceInCalendarDays } from "date-fns";
import { formatDate, formatDateTime, parseDateSafe } from "@/lib/dateFormat";
import { CampaignWorkspace } from "./CampaignWorkspace";
import { EditCampaignModal } from "./EditCampaignModal";
import {
  RecruitingCampaignListError,
  RecruitingCampaignListLoading,
} from "./RecruitingCampaignListStates";

// ── Role constants ─────────────────────────────────────────────────────────────

const EXEC_ROLES = new Set([
  "super_user", "super_admin", "root_super_admin", "recruiting_admin",
]);
function isExecRole(role: string | null | undefined) {
  return !!role && EXEC_ROLES.has(role);
}

const CAMPAIGN_EDIT_ROLES = new Set([
  "super_user", "root_super_admin", "admin", "corporate_admin", "manager", "recruiter", "recruiting_admin",
]);
function canEditCampaign(role: string | null | undefined) {
  return !!role && CAMPAIGN_EDIT_ROLES.has(role);
}

function canManageJobPostings(canManage: boolean | undefined) {
  return canManage === true;
}

const ARCHIVE_ROLES = new Set([
  "super_user", "super_admin", "root_super_admin", "corporate_admin",
]);
function canArchiveCampaign(role: string | null | undefined) {
  return !!role && ARCHIVE_ROLES.has(role);
}

const CLONE_REQUEST_ROLES = new Set([
  "corporate", "Corporate", "corporate_admin",
  "super_admin", "super_user", "root_super_admin",
  "recruiter", "recruiting_admin",
]);
function canCloneRequest(role: string | null | undefined) {
  return !!role && CLONE_REQUEST_ROLES.has(role);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Shared pill base — consistent sizing for all status/urgency/meta pills ─────
const PILL = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

// ── Request-status pill ───────────────────────────────────────────────────────
const REQUEST_STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  submitted:    { label: "Submitted",        cls: "bg-muted/60 text-muted-foreground border-border" },
  under_review: { label: "Pending Approval", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  approved:     { label: "Approved",         cls: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" },
  rejected:     { label: "Rejected",         cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
};
function StatusBadge({ status }: { status: string }) {
  const chip = REQUEST_STATUS_CHIP[status] ?? { label: status, cls: "bg-muted/60 text-muted-foreground border-border" };
  return <span className={`${PILL} ${chip.cls}`}>{chip.label}</span>;
}

// ── Campaign-status pill ──────────────────────────────────────────────────────
// Status colors per DriverHub UI Standards.
// Approved campaign statuses per DH-002085: Pending Approval, Active, Paused, Cancelled, Closed.
// "Completed" has been removed. Closed is the terminal successful status (green per UI standards).
const CAMPAIGN_STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  // Canonical values (used by recruiting_campaigns.status)
  pending_approval:  { label: "Pending",   cls: "bg-orange-500 text-white border-orange-500" },
  active:            { label: "Active",    cls: "bg-green-600 text-white border-green-600" },
  paused:            { label: "Paused",    cls: "bg-yellow-500 text-white border-yellow-500" },
  cancelled:         { label: "Cancelled", cls: "bg-red-600 text-white border-red-600" },
  closed:            { label: "Closed",    cls: "bg-green-600 text-white border-green-600" },
  // Legacy aliases (requisitions table used different values; kept for backwards compat display only)
  draft:             { label: "Active",    cls: "bg-green-600 text-white border-green-600" },
  open:              { label: "Active",    cls: "bg-green-600 text-white border-green-600" },
  open_active:       { label: "Active",    cls: "bg-green-600 text-white border-green-600" },
  on_hold:           { label: "Paused",    cls: "bg-yellow-500 text-white border-yellow-500" },
  filled:            { label: "Closed",    cls: "bg-green-600 text-white border-green-600" },
};
function CampaignStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const chip = CAMPAIGN_STATUS_CHIP[status] ?? { label: status, cls: "bg-muted/60 text-muted-foreground border-border" };
  return <span className={`${PILL} ${chip.cls}`}>{chip.label}</span>;
}

// Active is always Green per DriverHub standards; age does not change status color.
function CampaignStatusBadgeAged({ status }: { status: string | null | undefined; openDays?: number }) {
  return <CampaignStatusBadge status={status} />;
}

// ── Urgency pill — solid semantic colors, white text ──────────────────────────
// Approved urgency labels (source of truth: Recruiting Request Form).
// Keys 2 and 4 are retained as legacy fallbacks for any pre-existing records.
const URGENCY_CHIP: Record<number, { label: string; cls: string }> = {
  1: { label: "Maintenance / Back Up Role", cls: "bg-green-600 text-white border-green-600" },
  2: { label: "Med-Low",                    cls: "bg-blue-500 text-white border-blue-500" },
  3: { label: "Normal",                     cls: "bg-amber-500 text-white border-amber-500" },
  4: { label: "High",                       cls: "bg-orange-500 text-white border-orange-500" },
  5: { label: "Critical",                   cls: "bg-red-600 text-white border-red-600" },
};
// Urgency color rules:
//   urgency=1 (Maintenance / Back Up Role) → always Green; never escalates by age.
//   urgency=3 (Normal) 0–28 days → Yellow; 29+ days → Red.
//   urgency=5 (Critical) → always Red.
// urgencyLevel: optional string from the new campaigns table; "Maintenance / Back Up Role" forces green.
function UrgencyChip({ urgency, openDays, urgencyLevel }: { urgency: number; openDays?: number; urgencyLevel?: string | null }) {
  const base = URGENCY_CHIP[urgency] ?? { label: String(urgency), cls: "bg-muted/60 text-muted-foreground border-border" };
  let cls = base.cls;
  const isMaintenance = urgency === 1 || (urgencyLevel ?? "").toLowerCase().includes("maintenance");
  if (!isMaintenance && urgency === 3 && openDays !== undefined && openDays >= 29) {
    // Normal campaign aged past 28 days — escalate to red
    cls = "bg-red-600 text-white border-red-600";
  }
  return <span className={`${PILL} ${cls}`}>{base.label}</span>;
}

function safeDate(val: string | null | undefined, showTime = false) {
  if (!val) return "—";
  return showTime ? formatDateTime(val) : formatDate(val);
}
function formatPayRate(rate: string | number | null | undefined) {
  if (rate == null || rate === "") return "—";
  const n = parseFloat(String(rate));
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}
function calcOpenDays(startDate: string | null | undefined): number {
  if (!startDate) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), parseDateSafe(startDate)));
}

// ── Sort types ─────────────────────────────────────────────────────────────────

type SortKey =
  | "urgency" | "submittedAt" | "campaignStartDate" | "targetDate" | "targetDriverCount" | "openDays"
  | "dealershipName" | "campaignType" | "driverClassification" | "programType"
  | "employmentType" | "payRate" | "certLiaison" | "campaignStatus";
type SortDir = "asc" | "desc";

interface SortState { key: SortKey; dir: SortDir }

const DEFAULT_SORT: SortState = { key: "urgency", dir: "desc" };

// Returns 0 (Red / most urgent), 1 (Yellow), 2 (Green / least urgent).
// Mirrors UrgencyChip color logic so default sort order matches visual color.
// Maintenance (urgency=1) is always rank 2 (Green) regardless of age.
function urgencyColorRank(urgency: number | null | undefined, openDays: number, urgencyLevel?: string | null): number {
  const u = urgency ?? 0;
  if (u === 1 || (urgencyLevel ?? "").toLowerCase().includes("maintenance")) return 2; // Maintenance → always Green
  if (u === 5) return 0;                      // Critical → always Red
  if (u === 3 && openDays >= 29) return 0;    // Normal aged 29+ days → Red
  if (u === 3) return 1;                      // Normal 0–28 days → Yellow
  return 2;                                   // Med-Low / High / unset → Green group
}

function nextDir(current: SortState, key: SortKey): SortDir {
  if (current.key !== key) return key === "urgency" ? "desc" : "asc";
  return current.dir === "asc" ? "desc" : "asc";
}

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
  return sort.dir === "asc"
    ? <ArrowUp   className="h-3 w-3 text-primary" />
    : <ArrowDown className="h-3 w-3 text-primary" />;
}

// ── Table primitives ───────────────────────────────────────────────────────────

function Th({ children, sortKey, sort, onSort, right = false, center = false, sticky = false }: {
  children: React.ReactNode;
  sortKey?: SortKey;
  sort?: SortState;
  onSort?: (k: SortKey) => void;
  right?: boolean;
  center?: boolean;
  sticky?: boolean;
}) {
  const align = right ? "text-right" : center ? "text-center" : "text-left";
  // Note: alignment is intentionally NOT on the <th> — it lives only on the inner block span.
  // This prevents the sort arrow (position:absolute) from participating in text layout.
  const base = `text-[11px] font-semibold text-muted-foreground uppercase tracking-wide tracking-wider px-3 py-2 leading-tight`;
  const stickyClass = sticky ? " sticky left-0 z-20 bg-muted/50 border-r border-border/60" : "";
  if (sortKey && sort && onSort) {
    return (
      <th
        className={`${base}${stickyClass} select-none cursor-pointer hover:text-foreground transition-colors relative`}
        onClick={() => onSort(sortKey)}
        data-testid={`th-sort-${sortKey}`}
      >
        {/* block + pr-5 reserves 20px for the absolute arrow; alignment aligns the full-width block */}
        <span className={`block w-full pr-5 ${align}`}>{children}</span>
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <SortIcon col={sortKey} sort={sort} />
        </span>
      </th>
    );
  }
  return <th className={`${base}${stickyClass} ${align}`}>{children}</th>;
}
function Td({ children, className = "", ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
  return <td className={`px-3 py-2.5 text-sm align-middle ${className}`} {...rest}>{children}</td>;
}

// ── Unique values from dataset ─────────────────────────────────────────────────

function uniq(arr: (string | null | undefined)[]): string[] {
  return Array.from(new Set(arr.filter(Boolean) as string[])).sort();
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const ALL = "__all__";

// Defensive display maps — guard against any legacy snake_case that slips through
const PROGRAM_TYPE_DISPLAY: Record<string, string> = {
  driver_dash:  "DriverDash",
  driver_shift: "DriverShift",
  DriverDash:   "DriverDash",
  DriverShift:  "DriverShift",
  Hybrid:       "Hybrid",
};
const DRIVER_CLASS_DISPLAY: Record<string, string> = {
  independent_contractor: "Independent Contractor",
  employee:               "Employee",
  "Independent Contractor": "Independent Contractor",
  Employee:               "Employee",
};

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "pending_approval", label: "Pending Approval" },
  { value: "active",           label: "Active" },
  { value: "paused",           label: "Paused" },
  { value: "cancelled",        label: "Cancelled" },
  { value: "closed",           label: "Closed" },
];

function MultiSelectFilter({
  label, options, selected, onChange, testId,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  testId: string;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  const displayLabel =
    selected.length === 0 ? `${label}: All`
    : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
    : `${label}: ${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          data-testid={`select-${testId}`}
        >
          {displayLabel}
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={(e) => { e.preventDefault(); toggle(opt.value); }}
            className="flex items-center gap-2 cursor-pointer"
            data-testid={`option-${testId}-${opt.value}`}
          >
            <Checkbox checked={selected.includes(opt.value)} className="pointer-events-none" />
            <span>{opt.label}</span>
          </DropdownMenuItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); onChange([]); }}
              className="text-xs text-muted-foreground cursor-pointer"
              data-testid={`clear-${testId}`}
            >
              Clear selection
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FilterBarProps {
  filters: Record<string, string>;
  onFilter: (key: string, val: string) => void;
  onClear: () => void;
  options: {
    campaignTypes: string[];
    urgencies: string[];
    driverClassifications: string[];
    vehicleLicenseClasses: string[];
    programTypes: string[];
    employmentTypes: string[];
    certLiaisons: string[];
  };
  activeCount: number;
  campaignStatuses: string[];
  onCampaignStatuses: (v: string[]) => void;
}

function FilterBar({
  filters, onFilter, onClear, options, activeCount,
  campaignStatuses, onCampaignStatuses,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <MultiSelectFilter
          label="Campaign Status"
          options={CAMPAIGN_STATUS_OPTIONS}
          selected={campaignStatuses}
          onChange={onCampaignStatuses}
          testId="filter-campaign-status"
        />

        <FilterSelect
          label="Campaign Type"
          value={filters.campaignType}
          onChange={(v) => onFilter("campaignType", v)}
          options={options.campaignTypes}
          testId="filter-campaign-type"
        />
        <FilterSelect
          label="Urgency"
          value={filters.urgency}
          onChange={(v) => onFilter("urgency", v)}
          options={options.urgencies}
          testId="filter-urgency"
        />
        <FilterSelect
          label="Driver Classification"
          value={filters.driverClassification}
          onChange={(v) => onFilter("driverClassification", v)}
          options={options.driverClassifications}
          testId="filter-driver-classification"
        />
        <FilterSelect
          label="Driver Type"
          value={filters.programType}
          onChange={(v) => onFilter("programType", v)}
          options={options.programTypes}
          testId="filter-driver-type"
        />
        <FilterSelect
          label="Employment Type"
          value={filters.employmentType}
          onChange={(v) => onFilter("employmentType", v)}
          options={options.employmentTypes}
          testId="filter-employment-type"
        />
        <FilterSelect
          label="Cert Liaison"
          value={filters.certLiaison}
          onChange={(v) => onFilter("certLiaison", v)}
          options={options.certLiaisons}
          testId="filter-cert-liaison"
        />
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="gap-1.5 text-muted-foreground"
            data-testid="btn-clear-filters"
          >
            <FilterX className="h-3.5 w-3.5" />
            Clear {activeCount > 0 ? `(${activeCount})` : ""}
          </Button>
        )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  testId: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-7 text-xs w-auto min-w-[110px] max-w-[170px]"
        data-testid={`select-${testId}`}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Detail field ───────────────────────────────────────────────────────────────

function DetailField({ label, value, icon: Icon, span = false }: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2 sm:col-span-2" : ""}>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm text-foreground">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

// ── Archive Campaign Dialog ─────────────────────────────────────────────────────

interface ArchiveCampaignDialogProps {
  open: boolean;
  campaign: any | null;
  onClose: () => void;
  onArchived: () => void;
}

function ArchiveCampaignDialog({ open, campaign, onClose, onArchived }: ArchiveCampaignDialogProps) {
  const { toast } = useToast();
  const [reason, setReason]       = useState("");
  const [reasonError, setReasonError] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/recruiting/requests/${id}/archive`, { reason }).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests/archived"] });
      if (campaign?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaign.id] });
      }
      toast({
        title: "Campaign archived",
        description: "The campaign has been removed from the active list and placed in Archives.",
      });
      setReason("");
      setReasonError(false);
      onArchived();
    },
    onError: (err: any) => {
      toast({ title: "Archive failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function handleConfirm() {
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    archiveMutation.mutate({ id: campaign!.id, reason: reason.trim() });
  }

  function handleClose() {
    if (archiveMutation.isPending) return;
    setReason("");
    setReasonError(false);
    onClose();
  }

  // Check if campaign has active applications (from the data already loaded)
  const hasActiveApps = campaign?.campaignRequisitionId &&
    (campaign?._activeApplicationCount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
            Archive Campaign
          </DialogTitle>
          <DialogDescription className="text-sm">
            Are you sure you want to archive this recruiting campaign?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campaign summary */}
          {campaign && (
            <div className="rounded-md bg-muted/50 border px-3 py-2.5 text-sm space-y-0.5">
              <p className="font-medium">{campaign.dealershipName || "—"}</p>
              {campaign.location && <p className="text-muted-foreground text-xs">{campaign.location}</p>}
              {campaign.campaignType && (
                <p className="text-muted-foreground text-xs capitalize">{campaign.campaignType}</p>
              )}
            </div>
          )}

          {/* Active applications warning */}
          {hasActiveApps && (
            <div className="rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50/60 dark:bg-yellow-900/10 px-3 py-2.5 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                This campaign has active applications. Archiving will remove it from active campaign views but will <strong>not</strong> delete any candidate or application records.
              </p>
            </div>
          )}

          {/* Reason (required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Reason for archiving
              <span className="ml-1 text-destructive">*</span>
            </label>
            <Textarea
              placeholder="e.g. Created in error, campaign no longer needed, position filled by other means…"
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(false); }}
              className={`text-sm min-h-[80px] ${reasonError ? "border-destructive focus-visible:ring-destructive" : ""}`}
              data-testid="textarea-archive-reason"
            />
            {reasonError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                A reason is required before archiving.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            The original request, approval history, and campaign audit trail will be preserved. This action can be reviewed in the Archives tab.
          </p>
        </div>

        <DialogFooter className="gap-2 flex-wrap sm:justify-start">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={archiveMutation.isPending}
            data-testid="btn-archive-confirm"
          >
            {archiveMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Archive className="h-3.5 w-3.5 mr-1.5" />}
            Archive Campaign
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={archiveMutation.isPending}
            data-testid="btn-archive-cancel"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Close Campaign Dialog — DH-002142: multi-step closure flow ────────────────
// Step 1: Confirm + optional notes
// Step 2: Identify activated drivers (searchable multi-select with suggestions)
// Step 3: Summary → Close Campaign button submits everything atomically

type DriverRow = {
  id: string;
  displayName: string;
  employeeId: string | null;
  status: string;
  driverClassification: string | null;
  driverType: string | null;
  employmentType: string | null;
  hireDate: string | null;
  market: string | null;
};

function CloseCampaignDialog({ open, campaign, onClose, onClosed }: {
  open: boolean;
  campaign: any | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [notes, setNotes]             = useState("");
  // DH-002168: Business-effective closing date, defaults to today
  const [actualClosingDate, setActualClosingDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [driverSearch, setDriverSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [driverLookup, setDriverLookup] = useState<Record<string, DriverRow>>({});

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1); setNotes("");
      setActualClosingDate(new Date().toISOString().split("T")[0]);
      setDriverSearch(""); setDebouncedSearch("");
      setSelectedIds(new Set()); setDriverLookup({});
    }
  }, [open]);

  // 300ms debounce for search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(driverSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [driverSearch]);

  // Suggested drivers — fetched once on entering step 2
  const {
    data: suggestions = [],
    isLoading: suggestionsLoading,
    isError: suggestionsError,
    refetch: refetchSuggestions,
  } = useQuery<DriverRow[]>({
    queryKey: ["/api/recruiting/requests", campaign?.id, "suggested-drivers"],
    queryFn: () =>
      fetch(`/api/recruiting/requests/${campaign!.id}/suggested-drivers`, { credentials: "include" })
        .then((r) => { if (!r.ok) throw new Error("Failed to fetch suggestions"); return r.json(); })
        .then((d) => {
          // DH-002336: a malformed 200 must surface as a discovery failure, not a
          // silent legitimate-zero — those two states must stay distinguishable.
          if (!Array.isArray(d)) throw new Error("Unexpected suggestions response");
          return d;
        }),
    enabled: open && step === 2 && !!campaign?.id,
    staleTime: 60_000,
  });

  // Debounced driver search
  const {
    data: searchResults = [],
    isError: searchError,
    refetch: refetchSearch,
  } = useQuery<DriverRow[]>({
    queryKey: ["/api/drivers/search", debouncedSearch, "campaign-close"],
    queryFn: () =>
      fetch(`/api/drivers/search?q=${encodeURIComponent(debouncedSearch)}&active=false`, { credentials: "include" })
        .then((r) => { if (!r.ok) throw new Error("Failed to search drivers"); return r.json(); })
        .then((d) => {
          // DH-002336: same rule as suggestions — a malformed 200 is a discovery
          // failure, not a legitimate zero.
          if (!Array.isArray(d)) throw new Error("Unexpected search response");
          return d;
        }),
    enabled: open && step === 2 && debouncedSearch.length > 0,
    staleTime: 15_000,
  });

  // Keep lookup table populated so selected drivers stay visible after search changes
  useEffect(() => {
    const all = [...suggestions, ...searchResults];
    if (!all.length) return;
    setDriverLookup((prev) => {
      const next = { ...prev };
      all.forEach((d) => { next[d.id] = d; });
      return next;
    });
  }, [suggestions, searchResults]);

  // Build display list: suggestions when no search term, results when searching
  const displayList = useMemo((): Array<DriverRow & { isSuggested: boolean }> => {
    const suggestIds = new Set(suggestions.map((d) => d.id));
    if (!debouncedSearch) return suggestions.map((d) => ({ ...d, isSuggested: true }));
    return searchResults.map((d) => ({ ...d, isSuggested: suggestIds.has(d.id) }));
  }, [suggestions, searchResults, debouncedSearch]);

  // Selected driver details (for summary step)
  const selectedDrivers = Array.from(selectedIds).map((id) => driverLookup[id]).filter(Boolean) as DriverRow[];
  const empCount   = selectedDrivers.filter((d) => d.driverClassification === "Employee").length;
  const icCount    = selectedDrivers.filter((d) => d.driverClassification === "Independent Contractor").length;
  const otherCount = selectedDrivers.length - empCount - icCount;

  // Atomic close: PATCH status → POST driver links
  const closeMutation = useMutation({
    mutationFn: async ({ id, driverIds, actualClosingDate: acd }: { id: string; driverIds: string[]; actualClosingDate: string }) => {
      const closeRes = await apiRequest("PATCH", `/api/recruiting/requests/${id}/details`, { campaignStatus: "closed", actualClosingDate: acd });
      const closeData = await closeRes.json();
      if (!closeRes.ok) throw new Error(closeData?.message || "Failed to close campaign");
      if (driverIds.length > 0) {
        const linkRes = await apiRequest("POST", `/api/recruiting/requests/${id}/activated-drivers`, {
          driverIds, reason: "closure",
        });
        if (!linkRes.ok) {
          const err = await linkRes.json().catch(() => ({}));
          throw new Error(err?.message || "Campaign closed but failed to link drivers");
        }
      }
      return closeData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      if (campaign?.id) queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaign.id] });
      const count = selectedIds.size;
      toast({
        title: "Campaign closed",
        description: count > 0
          ? `Campaign closed. ${count} driver${count === 1 ? "" : "s"} linked.`
          : "Campaign closed and removed from the active list.",
      });
      onClosed();
    },
    onError: (err: any) => {
      toast({ title: "Close failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function toggleDriver(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleClose() {
    if (closeMutation.isPending) return;
    onClose();
  }

  const campName = campaign?.dealershipName || campaign?.location || "This Campaign";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={step === 2 ? "max-w-xl" : "max-w-md"}>

        {/* ── Step 1: Confirm + optional notes ──────────────────────────── */}
        {step === 1 && (<>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CircleX className="h-4 w-4 text-muted-foreground shrink-0" />
              Close Campaign
            </DialogTitle>
            <DialogDescription className="text-sm">
              Formally close this recruiting campaign. You'll identify the drivers activated before completing closure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {campaign && (
              <div className="rounded-md bg-muted/50 border px-3 py-2.5 text-sm space-y-0.5">
                <p className="font-medium">{campaign.dealershipName || "—"}</p>
                {campaign.location && <p className="text-muted-foreground text-xs">{campaign.location}</p>}
                {campaign.campaignType && <p className="text-muted-foreground text-xs capitalize">{campaign.campaignType}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Closing notes <span className="font-normal">(optional)</span>
              </label>
              <Textarea
                placeholder="e.g. Position filled, campaign concluded, no longer needed…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm min-h-[70px]"
                data-testid="textarea-close-notes"
              />
            </div>
            {/* DH-002168 — Actual Closing Date (required) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Actual Closing Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={actualClosingDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setActualClosingDate(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                required
                data-testid="input-actual-closing-date"
              />
              <p className="text-xs text-muted-foreground">
                Defaults to today. Set an earlier date if the campaign was operationally closed before this record was updated.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              All applicants, pipeline history, and campaign data will be preserved after closure.
            </p>
          </div>
          <DialogFooter className="gap-2 flex-wrap sm:justify-start">
            <Button size="sm" onClick={() => setStep(2)} disabled={!actualClosingDate} className="gap-1.5" data-testid="btn-close-campaign-next">
              Next: Identify Activated Drivers <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleClose} data-testid="btn-close-campaign-cancel">
              Cancel
            </Button>
          </DialogFooter>
        </>)}

        {/* ── Step 2: Driver selection ───────────────────────────────────── */}
        {step === 2 && (<>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              Drivers Activated from this Campaign
            </DialogTitle>
            <DialogDescription className="text-sm">
              Select the drivers who were activated as a result of this recruiting campaign.
              Suggestions are based on campaign criteria and are advisory only — you must confirm the final list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, Driver ID, or market…"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Driver list */}
            <div className="border rounded-md overflow-hidden">
              <div className="max-h-[280px] overflow-y-auto">
                {suggestionsLoading && !debouncedSearch && (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading suggestions…
                  </div>
                )}
                {(suggestionsError || (searchError && !!debouncedSearch)) ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-5 text-sm text-destructive text-center">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Driver discovery is unavailable.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (suggestionsError) refetchSuggestions();
                        if (searchError) refetchSearch();
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                ) : !suggestionsLoading && displayList.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    {debouncedSearch ? "No drivers match your search." : "No driver suggestions available. Search by name above."}
                  </div>
                )}
                {!debouncedSearch && !suggestionsLoading && displayList.length > 0 && (
                  <div className="px-3 py-1.5 bg-muted/30 border-b">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Suggested — based on campaign criteria
                    </p>
                  </div>
                )}
                {displayList.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDriver(d.id)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors border-b last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedIds.has(d.id)}
                      onCheckedChange={() => toggleDriver(d.id)}
                      className="mt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-sm font-medium">{d.displayName}</span>
                        {d.employeeId && <span className="text-[11px] text-muted-foreground">{d.employeeId}</span>}
                        {d.isSuggested && debouncedSearch && (
                          <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded px-1 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                            Suggested
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-2 mt-0.5">
                        {d.driverClassification && <span className="text-[11px] text-muted-foreground">{d.driverClassification}</span>}
                        {d.driverType && <span className="text-[11px] text-muted-foreground">· {d.driverType}</span>}
                        {d.hireDate && (
                          <span className="text-[11px] text-muted-foreground">
                            · Hired {format(parseISO(d.hireDate), "MMM d, yyyy")}
                          </span>
                        )}
                        {d.market && <span className="text-[11px] text-muted-foreground">· {d.market}</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                      d.status === "active"
                        ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                        : "bg-muted/60 text-muted-foreground border-border"
                    }`}>
                      {d.status}
                    </span>
                  </button>
                ))}
                {/* Persist selected drivers not in current display list */}
                {Array.from(selectedIds)
                  .filter((id) => !displayList.find((d) => d.id === id) && driverLookup[id])
                  .map((id) => {
                    const d = driverLookup[id];
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDriver(d.id)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors border-b last:border-b-0 bg-blue-50/30 dark:bg-blue-900/10"
                      >
                        <Checkbox checked className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{d.displayName}</span>
                          {d.employeeId && <span className="ml-1.5 text-[11px] text-muted-foreground">{d.employeeId}</span>}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{selectedIds.size}</span> driver{selectedIds.size !== 1 ? "s" : ""}
              {selectedIds.size === 0 && " — you can proceed without linking any drivers"}
            </p>
          </div>
          <DialogFooter className="gap-2 flex-wrap sm:justify-start">
            <Button size="sm" onClick={() => setStep(3)} className="gap-1.5">
              Review Summary <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
          </DialogFooter>
        </>)}

        {/* ── Step 3: Summary + confirm ─────────────────────────────────── */}
        {step === 3 && (<>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
              Confirm Campaign Closure
            </DialogTitle>
            <DialogDescription className="text-sm">
              Review the activated driver summary before closing this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Summary card */}
            <div className="rounded-md border bg-muted/30 px-3 py-3 space-y-2 text-sm">
              <p className="font-semibold">{campName}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="text-muted-foreground">Target Drivers</div>
                <div className="font-medium">{campaign?.targetDriverCount ?? "—"}</div>
                <div className="text-muted-foreground">Drivers Activated</div>
                <div className="font-medium">{selectedDrivers.length}</div>
                {empCount > 0 && (<><div className="text-muted-foreground pl-3">Employee</div><div>{empCount}</div></>)}
                {icCount > 0 && (<><div className="text-muted-foreground pl-3">Independent Contractor</div><div>{icCount}</div></>)}
                {otherCount > 0 && (<><div className="text-muted-foreground pl-3">Other</div><div>{otherCount}</div></>)}
              </div>
            </div>
            {selectedDrivers.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Selected Drivers</p>
                <ul className="space-y-0.5">
                  {selectedDrivers.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                      <span>{d.displayName}</span>
                      {d.employeeId && <span className="text-muted-foreground text-xs">{d.employeeId}</span>}
                      {d.driverClassification && <span className="text-muted-foreground text-xs">· {d.driverClassification}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selectedDrivers.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                No drivers selected. You can add activated drivers after closure using "Edit Activated Drivers" on the Campaign Detail.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 flex-wrap sm:justify-start">
            <Button
              size="sm"
              onClick={() => closeMutation.mutate({ id: campaign!.id, driverIds: Array.from(selectedIds), actualClosingDate })}
              disabled={closeMutation.isPending}
              data-testid="btn-close-campaign-confirm"
            >
              {closeMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <CircleX className="h-3.5 w-3.5 mr-1.5" />}
              Close Campaign
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStep(2)} disabled={closeMutation.isPending}>
              ← Back / Edit Selection
            </Button>
          </DialogFooter>
        </>)}

      </DialogContent>
    </Dialog>
  );
}

// ── Post-close prompt ─────────────────────────────────────────────────────────

function PostClosePromptDialog({
  campaign,
  onClone,
  onReturn,
}: {
  campaign: any | null;
  onClone: () => void;
  onReturn: () => void;
}) {
  return (
    <Dialog open={!!campaign} onOpenChange={(v) => { if (!v) onReturn(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-post-close-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Campaign Closed Successfully
          </DialogTitle>
          <DialogDescription>
            This campaign has been closed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {campaign && (
            <div className="rounded-md bg-muted/50 border px-3 py-2.5 text-sm space-y-0.5">
              <p className="font-medium">{campaign.dealershipName || "—"}</p>
              {campaign.location && <p className="text-muted-foreground text-xs">{campaign.location}</p>}
              {campaign.campaignType && (
                <p className="text-muted-foreground text-xs capitalize">{campaign.campaignType}</p>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Would you like to create a new Recruiting Request for this location?
          </p>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-start">
          <Button
            onClick={onClone}
            className="gap-1.5"
            data-testid="btn-post-close-clone"
          >
            <Copy className="h-4 w-4" />Clone Recruiting Request
          </Button>
          <Button
            variant="outline"
            onClick={onReturn}
            data-testid="btn-post-close-return"
          >
            Return to Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Activated Drivers Section (shown on Campaign Detail for closed campaigns) ──

type ActivatedDriverRecord = {
  id: string;
  driverId: string;
  activationDate: string | null;
  driverClassificationAtActivation: string | null;
  driverTypeAtActivation: string | null;
  employmentTypeAtActivation: string | null;
  linkedAt: string;
  displayName: string;
  employeeId: string | null;
  currentStatus: string;
  driverClassification: string | null;
  driverType: string | null;
  employmentType: string | null;
  hireDate: string | null;
};

function ActivatedDriversSection({ campaignId, userRole, showWhenEmpty = true, allowEdits = true }: {
  campaignId: string;
  userRole?: string | null;
  showWhenEmpty?: boolean;
  allowEdits?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const {
    data: activatedDrivers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ActivatedDriverRecord[]>({
    queryKey: ["/api/recruiting/requests", campaignId, "activated-drivers"],
    queryFn: () =>
      fetch(`/api/recruiting/requests/${campaignId}/activated-drivers`, { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load activated drivers");
          return r.json();
        })
        .then((data) => {
          // A non-array success payload (e.g. an error object slipping through
          // with a 200) must never be treated as a legitimate empty list — it
          // has to surface as a load failure, not crash downstream .filter()/.map() calls.
          if (!Array.isArray(data)) throw new Error("Unexpected response loading activated drivers");
          return data;
        }),
    staleTime: 30_000,
  });

  const empCount = activatedDrivers.filter((d) =>
    d.driverClassification === "Employee"
  ).length;
  const icCount = activatedDrivers.filter((d) =>
    d.driverClassification === "Independent Contractor"
  ).length;

  if (!showWhenEmpty && !isLoading && !isError && activatedDrivers.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-900/5">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />Activated Drivers
              </h2>
              {!isLoading && !isError && (
                <span className="text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                  {activatedDrivers.length}
                </span>
              )}
              {!isLoading && !isError && activatedDrivers.length > 0 && (empCount > 0 || icCount > 0) && (
                <span className="text-[11px] text-muted-foreground">
                  {[empCount > 0 && `${empCount} Employee`, icCount > 0 && `${icCount} IC`].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            {allowEdits && !isError && canEditCampaign(userRole) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7 px-2.5 shrink-0"
                onClick={() => setEditOpen(true)}
                data-testid="btn-edit-activated-drivers"
              >
                <Pencil className="h-3 w-3" />Edit Activated Drivers
              </Button>
            )}
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
            </div>
          )}

          {isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-2" data-testid="error-activated-drivers">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Unable to load activated drivers. Please try again.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-retry-activated-drivers">
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && activatedDrivers.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No drivers linked to this campaign yet.
              {allowEdits && canEditCampaign(userRole) && " Use \"Edit Activated Drivers\" to add them."}
            </p>
          )}

          {!isLoading && activatedDrivers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {["Driver", "Driver ID", "Classification", "Driver Type", "Employment", "Activation Date", "Current Status"].map((h) => (
                      <th key={h} className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide py-1.5 pr-4 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activatedDrivers.map((d) => (
                    <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1 hover:underline text-left"
                          onClick={() => { window.location.href = `/drivers/${d.driverId}`; }}
                        >
                          {d.displayName}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{d.employeeId || "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{d.driverClassification || "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{d.driverType || "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{d.employmentType || "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {(d.activationDate || d.hireDate)
                          ? format(parseISO((d.activationDate || d.hireDate)!), "MMM d, yyyy")
                          : <span className="text-amber-600 text-xs">Missing — update driver record</span>}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                          d.currentStatus === "active"
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                            : "bg-muted/60 text-muted-foreground border-border"
                        }`}>
                          {d.currentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {allowEdits && (
        <EditActivatedDriversModal
          open={editOpen}
          campaignId={campaignId}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ── Edit Activated Drivers Modal ──────────────────────────────────────────────

function EditActivatedDriversModal({
  open, campaignId, onClose,
}: {
  open: boolean;
  campaignId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [addSearch, setAddSearch]             = useState("");
  const [debouncedAdd, setDebouncedAdd]       = useState("");
  const [removalReasons, setRemovalReasons]   = useState<Record<string, string>>({});
  const [removingId, setRemovingId]           = useState<string | null>(null);
  const [addingIds, setAddingIds]             = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setAddSearch(""); setDebouncedAdd(""); setRemovalReasons({});
      setRemovingId(null); setAddingIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAdd(addSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [addSearch]);

  const {
    data: current = [],
    isLoading: currentLoading,
    isError: currentError,
    refetch: refetchCurrent,
  } = useQuery<ActivatedDriverRecord[]>({
    queryKey: ["/api/recruiting/requests", campaignId, "activated-drivers"],
    queryFn: () =>
      fetch(`/api/recruiting/requests/${campaignId}/activated-drivers`, { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load activated drivers");
          return r.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error("Unexpected response loading activated drivers");
          return data;
        }),
    enabled: open,
  });

  const {
    data: addResults = [],
    isError: addResultsError,
    refetch: refetchAddResults,
  } = useQuery<DriverRow[]>({
    queryKey: ["/api/drivers/search", debouncedAdd, "edit-modal"],
    queryFn: () =>
      fetch(`/api/drivers/search?q=${encodeURIComponent(debouncedAdd)}&active=false`, { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error("Unable to search drivers");
          return r.json();
        })
        .then((data) => (Array.isArray(data) ? data : [])),
    enabled: open && debouncedAdd.length > 0,
  });

  const currentIds        = useMemo(() => new Set(current.map((d) => d.driverId)), [current]);
  const filteredAddResults = addResults.filter((d) => !currentIds.has(d.id));

  const removeMutation = useMutation({
    mutationFn: ({ driverId, reason }: { driverId: string; reason: string }) =>
      apiRequest("DELETE", `/api/recruiting/requests/${campaignId}/activated-drivers/${driverId}`, { reason })
        .then(async (r) => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Failed to remove"); } return r.json(); }),
    onSuccess: (_, { driverId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaignId, "activated-drivers"] });
      setRemovingId(null);
      setRemovalReasons((prev) => { const n = { ...prev }; delete n[driverId]; return n; });
      toast({ title: "Driver removed", description: "The driver has been removed from this campaign." });
    },
    onError: (err: any) => {
      toast({ title: "Remove failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: (driverIds: string[]) =>
      apiRequest("POST", `/api/recruiting/requests/${campaignId}/activated-drivers`, { driverIds })
        .then(async (r) => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Failed to add"); } return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaignId, "activated-drivers"] });
      setAddingIds(new Set()); setAddSearch(""); setDebouncedAdd("");
      toast({ title: "Driver(s) added", description: "The selected drivers have been linked to this campaign." });
    },
    onError: (err: any) => {
      toast({ title: "Add failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function toggleAdd(id: string) {
    setAddingIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
            Edit Activated Drivers
          </DialogTitle>
          <DialogDescription className="text-sm">
            Add a missed driver or remove an incorrectly linked one. All changes are audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {/* Currently linked */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Currently Linked</p>
            {currentLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
              </div>
            )}
            {currentError && (
              <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Unable to load currently linked drivers.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => refetchCurrent()}>
                  Retry
                </Button>
              </div>
            )}
            {!currentLoading && current.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No drivers currently linked.</p>
            )}
            {!currentLoading && current.map((d) => (
              <div key={d.id} className="border rounded-md mb-2 overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">{d.displayName}</span>
                      {d.employeeId && <span className="text-xs text-muted-foreground">{d.employeeId}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[d.driverClassification, d.driverType].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {removingId !== d.driverId ? (
                    <Button
                      size="sm" variant="ghost"
                      className="gap-1.5 text-destructive hover:text-destructive h-7 px-2 shrink-0"
                      onClick={() => setRemovingId(d.driverId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />Remove
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground shrink-0" onClick={() => setRemovingId(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
                {removingId === d.driverId && (
                  <div className="px-3 py-2.5 border-t bg-background space-y-2">
                    <input
                      type="text"
                      placeholder="Reason for removal (required)…"
                      value={removalReasons[d.driverId] || ""}
                      onChange={(e) => setRemovalReasons((prev) => ({ ...prev, [d.driverId]: e.target.value }))}
                      className="w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                      autoFocus
                    />
                    <Button
                      size="sm" variant="destructive" className="h-7"
                      disabled={!removalReasons[d.driverId]?.trim() || removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ driverId: d.driverId, reason: removalReasons[d.driverId] })}
                    >
                      {removeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                      Confirm Removal
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Add drivers */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add a Driver</p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or Driver ID…"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {addResultsError ? (
              <div className="flex items-center justify-between gap-2 px-3 py-3 text-sm text-destructive border rounded-md">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Driver discovery is unavailable.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => refetchAddResults()}>
                  Retry
                </Button>
              </div>
            ) : debouncedAdd && filteredAddResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No results.</p>
            )}
            {filteredAddResults.length > 0 && (
              <>
                <div className="border rounded-md overflow-hidden mb-2">
                  {filteredAddResults.slice(0, 10).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleAdd(d.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 border-b last:border-b-0 transition-colors"
                    >
                      <Checkbox
                        checked={addingIds.has(d.id)}
                        onCheckedChange={() => toggleAdd(d.id)}
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{d.displayName}</span>
                        {d.employeeId && <span className="ml-1.5 text-xs text-muted-foreground">{d.employeeId}</span>}
                        {d.driverClassification && (
                          <span className="ml-1.5 text-xs text-muted-foreground">· {d.driverClassification}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {addingIds.size > 0 && (
                  <Button
                    size="sm"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(Array.from(addingIds))}
                    className="h-7 gap-1.5"
                  >
                    {addMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <UserPlus className="h-3.5 w-3.5" />}
                    Link {addingIds.size} Driver{addingIds.size !== 1 ? "s" : ""}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Detail View ───────────────────────────────────────────────────────

// ── Job Postings — shared constants ──────────────────────────────────────────
const POSTING_STATUS_META: Record<string, { label: string; cls: string }> = {
  active:  { label: "Active",  cls: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  paused:  { label: "Paused",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
  removed: { label: "Removed", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400" },
};
const JOB_POSTING_SOURCES_LIST = [
  "Indeed", "Craigslist", "Facebook", "ZipRecruiter", "LinkedIn",
  "Nextdoor", "Local / Community Group", "Military / Veteran Board", "Other",
] as const;
const JOB_POSTING_STATUSES_LIST = ["active", "paused", "expired", "removed"] as const;

function PostingStatusBadge({ status }: { status: string }) {
  const meta = POSTING_STATUS_META[status] ?? { label: status, cls: "" };
  return <Badge className={`text-[10px] border ${meta.cls}`}>{meta.label}</Badge>;
}

// ── Add / Edit Job Posting Dialog ─────────────────────────────────────────────
function AddJobPostingDialog({
  open, onOpenChange, campaignId, posting, onSuccess,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  campaignId: string; posting?: any; onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!posting;
  const todayStr = new Date().toISOString().slice(0, 10);

  const [source,        setSource]        = useState(posting?.source        ?? "");
  const [sourceName,    setSourceName]    = useState(posting?.sourceName    ?? "");
  const [postingUrl,    setPostingUrl]    = useState(posting?.postingUrl    ?? "");
  const [postingStatus, setPostingStatus] = useState(posting?.postingStatus ?? "active");
  const [postedAt,      setPostedAt]      = useState(posting?.postedAt      ?? todayStr);
  const [expiresAt,     setExpiresAt]     = useState(posting?.expiresAt     ?? "");
  const [notes,         setNotes]         = useState(posting?.notes         ?? "");
  const [errs,          setErrs]          = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setSource(posting?.source        ?? "");
      setSourceName(posting?.sourceName    ?? "");
      setPostingUrl(posting?.postingUrl    ?? "");
      setPostingStatus(posting?.postingStatus ?? "active");
      setPostedAt(posting?.postedAt      ?? todayStr);
      setExpiresAt(posting?.expiresAt     ?? "");
      setNotes(posting?.notes         ?? "");
      setErrs({});
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        source,
        sourceName: source === "Other" ? sourceName : undefined,
        postingUrl: postingUrl.trim(),
        postingStatus,
        postedAt,
        expiresAt: expiresAt || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit) return apiRequest("PATCH", `/api/recruiting/campaigns/${campaignId}/postings/${posting.id}`, body);
      return apiRequest("POST", `/api/recruiting/campaigns/${campaignId}/postings`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns", campaignId, "postings"] });
      toast({ title: isEdit ? "Posting updated" : "Job posting added" });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => {
      const fieldErrors = e?.fieldErrors && typeof e.fieldErrors === "object" ? e.fieldErrors : null;
      if (fieldErrors) setErrs(fieldErrors);
      toast({
        title: isEdit ? "Unable to update posting" : "Unable to add posting",
        description: fieldErrors
          ? "Please correct the highlighted fields."
          : "DriverHub could not save this job posting. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrs: Record<string, string> = {};
    if (!source)               newErrs.source = "Source is required";
    if (source === "Other" && !sourceName.trim()) newErrs.sourceName = "Source name is required";
    if (!postingUrl.trim()) {
      newErrs.postingUrl = "Posting URL is required";
    } else {
      try { new URL(postingUrl.trim()); } catch { newErrs.postingUrl = "Must be a valid URL (include https://)"; }
    }
    if (!postedAt) newErrs.postedAt = "Posting date is required";
    if (!postingStatus) newErrs.postingStatus = "Status is required";
    if (postedAt && expiresAt && expiresAt < postedAt) {
      newErrs.expiresAt = "Expiration date cannot be before the posting date";
    }
    if (Object.keys(newErrs).length) { setErrs(newErrs); return; }
    setErrs({});
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-job-posting">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {isEdit ? "Edit Job Posting" : "Add Job Posting"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Source *</p>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-posting-source">
                <SelectValue placeholder="Select source…" />
              </SelectTrigger>
              <SelectContent>
                {JOB_POSTING_SOURCES_LIST.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errs.source && <p className="text-xs text-destructive">{errs.source}</p>}
          </div>

          {source === "Other" && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Source Name *</p>
              <Input className="h-8 text-sm" placeholder="e.g. Dallas Jobs Board"
                value={sourceName} onChange={(e) => setSourceName(e.target.value)}
                data-testid="input-posting-source-name" />
              {errs.sourceName && <p className="text-xs text-destructive">{errs.sourceName}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Posting URL *</p>
            <Input className="h-8 text-sm" placeholder="https://…"
              value={postingUrl} onChange={(e) => setPostingUrl(e.target.value)}
              data-testid="input-posting-url" />
            {errs.postingUrl && <p className="text-xs text-destructive">{errs.postingUrl}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Posting Date *</p>
              <Input type="date" className="h-8 text-sm" value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)} data-testid="input-posting-date" />
              {errs.postedAt && <p className="text-xs text-destructive">{errs.postedAt}</p>}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Expiration <span className="font-normal">(opt.)</span></p>
              <Input type="date" className="h-8 text-sm" value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)} data-testid="input-posting-expires" />
              {errs.expiresAt && <p className="text-xs text-destructive">{errs.expiresAt}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Status *</p>
            <Select value={postingStatus} onValueChange={setPostingStatus}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-posting-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_POSTING_STATUSES_LIST.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errs.postingStatus && <p className="text-xs text-destructive">{errs.postingStatus}</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></p>
            <Textarea className="text-sm resize-none" rows={2}
              placeholder="e.g. Renew every 30 days, Sponsored posting…"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-posting-notes" />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={mutation.isPending} data-testid="button-save-posting">
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Save Posting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Job Postings Section (Campaign Detail) ────────────────────────────────────
function JobPostingsSection({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [addOpen,     setAddOpen]     = useState(false);
  const [editPosting, setEditPosting] = useState<any>(null);

  const { data: postings = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/recruiting/campaigns", campaignId, "postings"],
    queryFn: () =>
      fetch(`/api/recruiting/campaigns/${campaignId}/postings`, { credentials: "include" })
        .then((r) => { if (!r.ok) throw new Error("Failed to load postings"); return r.json(); })
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: (postingId: string) =>
      apiRequest("PATCH", `/api/recruiting/campaigns/${campaignId}/postings/${postingId}`, { postingStatus: "removed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns", campaignId, "postings"] });
      toast({ title: "Posting removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const visible      = postings.filter((p) => p.postingStatus !== "removed");
  const removedCount = postings.filter((p) => p.postingStatus === "removed").length;
  const sourceLabel  = (p: any) => p.source === "Other" ? (p.sourceName || "Other") : p.source;

  return (
    <div className="space-y-3" data-testid="section-job-postings">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />Job Postings
        </h2>
        {canEdit && (
          <Button
            size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
            onClick={() => setAddOpen(true)}
            data-testid="button-add-job-posting"
          >
            <Plus className="h-3 w-3" />Add Job Posting
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border rounded-md bg-muted/20">
          No job postings yet.
          {canEdit && (
            <> <button className="underline hover:text-foreground font-medium ml-1" onClick={() => setAddOpen(true)}>Add one →</button></>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <div key={p.id} className="border rounded-md p-3 space-y-2 bg-background" data-testid={`posting-row-${p.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{sourceLabel(p)}</span>
                  <PostingStatusBadge status={p.postingStatus} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={p.postingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" data-testid={`button-view-posting-${p.id}`}>
                      <ExternalLink className="h-3 w-3" />View Posting
                    </Button>
                  </a>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setEditPosting(p)} title="Edit posting"
                        data-testid={`button-edit-posting-${p.id}`}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeMutation.mutate(p.id)} title="Remove posting"
                        data-testid={`button-remove-posting-${p.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>Posted {format(new Date(p.postedAt), "MMM d, yyyy")}</span>
                {p.expiresAt && <span>· Expires {format(new Date(p.expiresAt), "MMM d, yyyy")}</span>}
              </div>
              {p.postingUrl && (
                <p className="text-[10px] font-mono text-muted-foreground truncate">{p.postingUrl}</p>
              )}
              {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {removedCount > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {removedCount} removed posting{removedCount !== 1 ? "s" : ""} not shown
        </p>
      )}

      <AddJobPostingDialog open={addOpen} onOpenChange={setAddOpen} campaignId={campaignId} onSuccess={refetch} />
      {editPosting && (
        <AddJobPostingDialog
          open={!!editPosting}
          onOpenChange={(v) => { if (!v) setEditPosting(null); }}
          campaignId={campaignId}
          posting={editPosting}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CampaignDetailView({ campaignId, onCloneRequest }: { campaignId: string; onCloneRequest?: (campaign: any) => void }) {
  const [, setLocation]             = useLocation();
  const { toast }                   = useToast();
  const { user }                    = useAuth();
  const [notes, setNotes]           = useState("");
  const [notesError, setNotesError] = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [closeOpen, setCloseOpen]   = useState(false);
  const [postClosedCampaign, setPostClosedCampaign] = useState<any>(null);

  const { data: campaign, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/recruiting/requests", campaignId],
    queryFn: () => fetch(`/api/recruiting/requests/${campaignId}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
  });

  // Fetch linked account to hydrate address when campaign address is blank
  const acctLookupKey = campaign?.accountId || campaign?.dealershipName || "";
  const {
    data: linkedAccount,
    isError: linkedAccountError,
    refetch: refetchLinkedAccount,
  } = useQuery<any>({
    queryKey: ["/api/accounts/search", acctLookupKey],
    queryFn: async () => {
      if (!acctLookupKey) return null;
      const name = campaign?.dealershipName || "";
      const res = await fetch(
        `/api/accounts/search?q=${encodeURIComponent(name)}&limit=500`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Unable to load linked account.");
      const rows: any[] = await res.json();
      if (campaign?.accountId) return rows.find((r: any) => r.id === campaign.accountId) ?? rows[0] ?? null;
      return rows[0] ?? null;
    },
    enabled: !!acctLookupKey && !!campaign,
    staleTime: 60_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ requestStatus, reviewNotes }: any) =>
      apiRequest("PATCH", `/api/recruiting/requests/${campaignId}/status`, { requestStatus, reviewNotes })
        .then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests", campaignId] });
      if (data?._autoCampaign) {
        const detailPath = data.operationalCampaign?.detailPath
          || data._autoCampaign.detailPath
          || `/recruiting/campaigns/${campaignId}`;
        toast({ title: "Approved — Campaign Created", description: "Opening the operational Campaign Detail." });
        setTimeout(() => setLocation(detailPath), 700);
      } else {
        toast({ title: "Decision recorded", description: "The request status has been updated." });
        setNotes("");
      }
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function handleAction(requestStatus: string) {
    // Reject and Send Back both require comments
    if ((requestStatus === "rejected" || requestStatus === "under_review") && !notes.trim()) {
      setNotesError(true);
      return;
    }
    setNotesError(false);
    statusMutation.mutate({ requestStatus, reviewNotes: notes.trim() || undefined });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading request details…
      </div>
    );
  }
  if (isError || !campaign) {
    return (
      <div className="py-12 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="font-medium text-sm">Request not found</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/recruiting/campaigns")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to campaigns
        </Button>
      </div>
    );
  }

  const isPending   = campaign.requestStatus === "submitted" || campaign.requestStatus === "under_review";
  const isApproved  = campaign.requestStatus === "approved";
  const isRejected  = campaign.requestStatus === "rejected";

  // Sign-on bonus display
  const signOnDisplay = campaign.signOnBonus
    ? campaign.signOnBonusAmount
      ? `Yes — $${Number(campaign.signOnBonusAmount).toLocaleString("en-US", { minimumFractionDigits: 0 })}`
      : "Yes"
    : "No";

  // Effective address — use campaign's own fields when present, fall back to linked account
  const campaignHasAddress = !!(campaign.address || campaign.city || campaign.state || campaign.zipCode);
  const effectiveAddress = campaign.address || linkedAccount?.address || null;
  const effectiveCity    = campaign.city    || linkedAccount?.city    || null;
  const effectiveState   = campaign.state   || linkedAccount?.state   || null;
  const effectiveZip     = campaign.zipCode || linkedAccount?.zip     || null;
  const effectiveHasAddress = !!(effectiveAddress || effectiveCity || effectiveState || effectiveZip);
  const addressFromAccount  = !campaignHasAddress && effectiveHasAddress;

  return (
    <div className="space-y-5 w-full" data-testid={`section-campaign-detail-${campaignId}`}>

      {/* ── Header ── */}
      <div className="space-y-2">

        {/* Row 1 — breadcrumb */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/recruiting/campaigns")}
          data-testid="btn-campaign-back"
          className="gap-1.5 -ml-1 text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />Active Campaigns
        </Button>

        {/* Row 2 — name + actions */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h1 className="text-xl font-semibold leading-tight truncate">
              {campaign.dealershipName || campaign.location || "Campaign Detail"}
            </h1>
            {campaign.dealershipName && campaign.location && (
              <p className="text-sm text-muted-foreground truncate">{campaign.location}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setLocation(`/recruiting/campaigns/${campaignId}/workspace`)}
              data-testid={`btn-open-workspace-${campaignId}`}
            >
              <Rocket className="h-3.5 w-3.5" />Campaign Workspace
            </Button>
            {canEditCampaign(user?.role) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setEditOpen(true)}
                data-testid={`btn-edit-campaign-detail-${campaignId}`}
              >
                <Pencil className="h-3.5 w-3.5" />Edit Campaign
              </Button>
            )}
            {/* Clone as New Recruiting Request — available for closed campaigns */}
            {canCloneRequest(user?.role) && campaign.campaignStatus === "closed" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onCloneRequest?.(campaign)}
                data-testid={`btn-clone-request-detail-${campaignId}`}
              >
                <Copy className="h-3.5 w-3.5" />Clone as New Request
              </Button>
            )}
            {/* Secondary actions — Close and Archive — grouped in overflow menu */}
            {(
              (canEditCampaign(user?.role) && campaign.campaignStatus !== "closed") ||
              (canArchiveCampaign(user?.role) && !campaign.isArchived)
            ) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    data-testid={`btn-campaign-actions-more-${campaignId}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditCampaign(user?.role) && campaign.campaignStatus !== "closed" && (
                    <DropdownMenuItem
                      onClick={() => setCloseOpen(true)}
                      data-testid={`btn-close-campaign-detail-${campaignId}`}
                      className="gap-2"
                    >
                      <CircleX className="h-4 w-4 text-muted-foreground" />Close Campaign
                    </DropdownMenuItem>
                  )}
                  {canArchiveCampaign(user?.role) && !campaign.isArchived && (
                    <DropdownMenuItem
                      onClick={() => setArchiveOpen(true)}
                      data-testid={`btn-archive-campaign-detail-${campaignId}`}
                      className="gap-2"
                    >
                      <Archive className="h-4 w-4 text-muted-foreground" />Archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Row 3 — status + meta pills */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <StatusBadge status={campaign.requestStatus} />
          {campaign.campaignStatus && (
            <CampaignStatusBadge status={campaign.campaignStatus} />
          )}
          {campaign.urgency && <UrgencyChip urgency={campaign.urgency} openDays={calcOpenDays(campaign.campaignStartDate)} />}
          {campaign.campaignType && (
            <span className={`${PILL} bg-muted/60 text-muted-foreground border-border capitalize`}>
              {campaign.campaignType}
            </span>
          )}
          {campaign.driverClassification && (
            <span className={`${PILL} bg-muted/60 text-muted-foreground border-border`}>
              {campaign.driverClassification}
            </span>
          )}
          {(campaign.programType || campaign.driverType) && (
            <span className={`${PILL} bg-muted/60 text-muted-foreground border-border`}>
              {campaign.programType || campaign.driverType}
            </span>
          )}
          {campaign.campaignRequisitionId && (
            <span className={`${PILL} bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800`} data-testid={`badge-campaign-linked-${campaignId}`}>
              Campaign Created
            </span>
          )}
          {campaign.isArchived && (
            <span className={`${PILL} bg-muted/60 text-muted-foreground border-border`} data-testid={`badge-archived-${campaignId}`}>
              Archived
            </span>
          )}
        </div>

      </div>

      {/* ── Approval Decision card — top, only for authorized Recruiting approvers ── */}
      {isPending && isExecRole(user?.role) && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-start gap-3">
              <ClipboardList className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h2 className="font-semibold text-base">Awaiting Your Decision</h2>
                <p className="text-xs text-muted-foreground">
                  Submitted by <span className="font-medium text-foreground">{campaign.submittedByName || "—"}</span>
                  {campaign.submittedAt ? ` on ${safeDate(campaign.submittedAt, true)}` : ""}
                  {campaign.requestOrigin ? ` · Origin: ${campaign.requestOrigin}` : ""}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Comments
                <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">
                  (required when rejecting or sending back)
                </span>
              </label>
              <Textarea
                placeholder="Enter comments, reason for rejection, or information needed from submitter…"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setNotesError(false); }}
                className={`text-sm min-h-[80px] bg-background ${notesError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                data-testid={`textarea-approval-notes-detail-${campaignId}`}
              />
              {notesError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Comments are required when rejecting or sending back a request.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => handleAction("approved")}
                disabled={statusMutation.isPending}
                data-testid={`btn-detail-approve-${campaignId}`}
              >
                {statusMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAction("rejected")}
                disabled={statusMutation.isPending}
                data-testid={`btn-detail-reject-${campaignId}`}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("under_review")}
                disabled={statusMutation.isPending}
                data-testid={`btn-detail-send-back-${campaignId}`}
                className="bg-background"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />Send Back for More Information
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Approved / rejected outcome banner ── */}
      {(isApproved || isRejected) && (campaign.reviewedBy || campaign.reviewNotes) && (
        <Card className={isApproved
          ? "border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10"
          : "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10"}>
          <CardContent className="pt-4 pb-4 space-y-1.5">
            <div className="flex items-center gap-2">
              {isApproved
                ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                : <XCircle      className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />}
              <p className="text-sm font-semibold">
                {isApproved ? "Request Approved" : "Request Rejected"}
              </p>
            </div>
            {campaign.reviewedBy && (
              <p className="text-xs text-muted-foreground pl-6">
                By <span className="font-medium text-foreground">{campaign.reviewedBy}</span>
                {campaign.reviewedAt ? ` on ${safeDate(campaign.reviewedAt, true)}` : ""}
              </p>
            )}
            {campaign.reviewNotes && (
              <div className="ml-6 rounded-md bg-background border px-3 py-2 text-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-foreground">{campaign.reviewNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Activated Drivers — historical links retain current driver data ── */}
      {(campaign.campaignStatus === "closed" || campaign.campaignStatus === "active") && (
        <ActivatedDriversSection
          campaignId={campaignId}
          userRole={user?.role}
          showWhenEmpty={campaign.campaignStatus === "closed"}
          allowEdits={campaign.campaignStatus === "closed"}
        />
      )}

      {/* ── 1. Campaign Overview ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Rocket className="h-3.5 w-3.5" />Campaign Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Request Origin" value={campaign.requestOrigin}  icon={Info} />
            <DetailField label="Account Name"   value={campaign.dealershipName} icon={Briefcase} />
            <DetailField label="Campaign Label" value={campaign.location}       icon={MapPin} />
            <DetailField label="Campaign Type"  value={campaign.campaignType
              ? campaign.campaignType.charAt(0).toUpperCase() + campaign.campaignType.slice(1)
              : null} icon={FileText} />
            <DetailField label="Market" value={campaign.market
              ? `${campaign.market}${campaign.marketCode ? ` (${campaign.marketCode})` : ""}`
              : null} icon={MapPin} />
            <DetailField label="Urgency" value={campaign.urgency ? <UrgencyChip urgency={campaign.urgency} openDays={calcOpenDays(campaign.campaignStartDate)} /> : null} />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Location / Account Address ── */}
      {effectiveHasAddress && (
        <Card>
          <CardContent className="pt-5 pb-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />Location / Account Address
              </h2>
              {addressFromAccount && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md shrink-0">
                  From linked account
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
              {effectiveAddress && (
                <DetailField label="Street Address" value={effectiveAddress} icon={MapPin} />
              )}
              {(effectiveCity || effectiveState) && (
                <DetailField label="City / State"
                  value={[effectiveCity, effectiveState].filter(Boolean).join(", ")}
                  icon={MapPin} />
              )}
              {effectiveZip && (
                <DetailField label="Zip Code" value={effectiveZip} icon={MapPin} />
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {!campaignHasAddress && linkedAccountError && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 pb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Linked account details could not be loaded.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetchLinkedAccount()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Driver Requirements ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />Driver Requirements
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Driver Classification"   value={campaign.driverClassification} icon={Shield} />
            <DetailField label="Driver Type"             value={campaign.programType}          icon={User} />
            <DetailField label="Vehicle / License Class" value={campaign.vehicleLicenseClass}  icon={User} />
            <DetailField label="Employment Type"         value={campaign.employmentType}        icon={Shield} />
            <DetailField label="Target # of Drivers"     value={campaign.targetDriverCount}    icon={Users} />
            <DetailField label="Driver Schedule"         value={campaign.driverSchedule}       icon={CalendarDays} />
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Recruiting Assignment ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />Recruiting Assignment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Recruiter"    value={campaign.recruiter}       icon={User} />
            <DetailField label="Cert Liaison" value={campaign.certLiaison}     icon={User} />
            <DetailField label="Submitted By" value={campaign.submittedByName} icon={User} />
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Compensation / Bonus ── */}
      <Card>
        <CardContent className="pt-5 pb-6 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Compensation / Bonus
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Driver Pay Rate" value={campaign.payRate != null ? formatPayRate(campaign.payRate) : null} icon={DollarSign} />
            <DetailField label="Sign-On Bonus"   value={signOnDisplay} icon={DollarSign} />
            {campaign.signOnBonusOption && (
              <DetailField label="Bonus Option" value={campaign.signOnBonusOption} />
            )}
          </div>
          {campaign.signOnBonusNotes && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Bonus Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-md border px-3 py-2.5">
                {campaign.signOnBonusNotes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 6. Notes / Additional Comments ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />Notes / Additional Comments
          </h2>
          {campaign.additionalComments ? (
            <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-md border px-3 py-2.5">
              {campaign.additionalComments}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No additional comments.</p>
          )}
        </CardContent>
      </Card>

      {/* ── 7. Job Postings ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <JobPostingsSection campaignId={campaignId} canEdit={canManageJobPostings(campaign.canManageJobPostings)} />
        </CardContent>
      </Card>

      {/* ── 8. Timeline / Approval History ── */}
      <Card>
        <CardContent className="pt-5 pb-6 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />Timeline / Approval History
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <DetailField label="Submitted At"     value={safeDate(campaign.submittedAt, true)} icon={Clock} />
            <DetailField label="Target Fill Date" value={safeDate(campaign.targetDate)}        icon={Target} />
          </div>
          {!isPending && campaign.approvalStatus && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">Status:</span>
                    <StatusBadge status={campaign.requestStatus} />
                  </div>
                  {campaign.approvalStatus && campaign.approvalStatus !== campaign.requestStatus && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">Decision:</span>
                      <span className={`${PILL} bg-muted/60 text-muted-foreground border-border capitalize`}>{campaign.approvalStatus}</span>
                    </div>
                  )}
                </div>
                {campaign.reviewedBy && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed by <span className="font-medium text-foreground">{campaign.reviewedBy}</span>
                    {campaign.reviewedAt ? ` on ${safeDate(campaign.reviewedAt, true)}` : ""}
                  </p>
                )}
                {campaign.reviewNotes && !(isApproved || isRejected) && (
                  <div className="rounded-md bg-muted/40 border px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                    <p>{campaign.reviewNotes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Campaign Modal ── */}
      {campaign && (
        <EditCampaignModal
          campaign={campaign}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* ── Archive Campaign Dialog ── */}
      <ArchiveCampaignDialog
        open={archiveOpen}
        campaign={campaign}
        onClose={() => setArchiveOpen(false)}
        onArchived={() => {
          setArchiveOpen(false);
          setLocation("/recruiting/campaigns");
        }}
      />

      {/* ── Close Campaign Dialog ── */}
      <CloseCampaignDialog
        open={closeOpen}
        campaign={campaign}
        onClose={() => setCloseOpen(false)}
        onClosed={() => {
          setCloseOpen(false);
          // Show post-close prompt instead of navigating away immediately
          setPostClosedCampaign(campaign);
        }}
      />

      {/* ── Post-close prompt ── */}
      <PostClosePromptDialog
        campaign={postClosedCampaign}
        onClone={() => {
          const c = postClosedCampaign;
          setPostClosedCampaign(null);
          onCloneRequest?.(c);
        }}
        onReturn={() => setPostClosedCampaign(null)}
      />
    </div>
  );
}

// ── Pending queue dialog ───────────────────────────────────────────────────────

function RequestDetailDialog({ req, open, onClose }: { req: any; open: boolean; onClose: () => void }) {
  const { toast }                       = useToast();
  const [, setLocation]                 = useLocation();
  const [notes, setNotes]               = useState("");
  const [notesError, setNotesError]     = useState(false);
  const [rejectOpen, setRejectOpen]     = useState(false);
  const [autoCampaign, setAutoCampaign] = useState<any>(null);

  const statusMutation = useMutation({
    mutationFn: ({ requestStatus, reviewNotes }: any) =>
      apiRequest("PATCH", `/api/recruiting/requests/${req.id}/status`, { requestStatus, reviewNotes })
        .then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests/pending"] });
      if (data?._autoCampaign) {
        setAutoCampaign(data._autoCampaign);
        // Don't close — show the success state in the dialog
      } else {
        toast({ title: "Request updated", description: "Status has been updated." });
        onClose();
      }
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  function handleAction(status: string) {
    if (status === "rejected") {
      if (!rejectOpen) { setRejectOpen(true); return; }
      if (!notes.trim()) { setNotesError(true); return; }
    }
    setNotesError(false);
    statusMutation.mutate({ requestStatus: status, reviewNotes: notes || undefined });
  }

  function handleClose() {
    setAutoCampaign(null);
    setNotes("");
    setNotesError(false);
    setRejectOpen(false);
    onClose();
  }

  const isPending = req.requestStatus === "submitted" || req.requestStatus === "under_review";

  // Key fields shown in the approval card
  const fields: [string, string][] = [
    ["Account",          req.dealershipName   || "—"],
    ["Campaign",         req.location         || "—"],
    ["Driver Type",            req.programType          || "—"],
    ["Vehicle / Lic. Class",   req.vehicleLicenseClass || "—"],
    ["Classification",         req.driverClassification || "—"],
    ["Employment Type",        req.employmentType       || "—"],
    ["Target Drivers",   String(req.targetDriverCount ?? "—")],
    ["Pay Rate",         formatPayRate(req.payRate)],
    ["Target Fill Date", safeDate(req.targetDate)],
    ["Schedule",         req.driverSchedule   || "—"],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            Recruiting Request Approval
          </DialogTitle>
        </DialogHeader>

        {/* ── Campaign created success state ── */}
        {autoCampaign ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Request Approved &amp; Campaign Created</p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-400 pl-7">
                A recruiting campaign has been automatically created and the assigned recruiter has been notified.
              </p>
              {autoCampaign.title && (
                <p className="text-xs font-medium text-green-800 dark:text-green-300 pl-7 pt-1">
                  {autoCampaign.title}
                </p>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-start pt-1">
              <Button
                size="sm"
                onClick={() => {
                  handleClose();
                  setLocation(
                    autoCampaign.detailPath
                      || `/recruiting/campaigns/${autoCampaign.requestId || req.id}`,
                  );
                }}
                data-testid={`btn-view-campaigns-${req.id}`}
              >
                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />View Campaign Detail
              </Button>
              <Button size="sm" variant="outline" onClick={handleClose} data-testid={`btn-dialog-close-${req.id}`}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {/* ── Status + urgency ── */}
            <div className="flex items-center gap-2 flex-wrap -mt-1">
              <span className="text-xs text-muted-foreground">Status:</span>
              <StatusBadge status={req.requestStatus} />
              <span className="text-xs text-muted-foreground ml-1">Urgency:</span>
              <UrgencyChip urgency={req.urgency} />
            </div>

            {/* ── Key fields ── */}
            <div className="space-y-2.5">
              {fields.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0 w-32 text-right text-xs">{label}:</span>
                  <span className="text-foreground font-medium">{value}</span>
                </div>
              ))}
              {req.additionalComments && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0 w-32 text-right text-xs pt-0.5">Comments:</span>
                  <span className="text-foreground whitespace-pre-wrap">{req.additionalComments}</span>
                </div>
              )}
            </div>

            {/* ── Prior review note (if any) ── */}
            {req.reviewNotes && (
              <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Review Note: </span>{req.reviewNotes}
              </div>
            )}

            {/* ── Reject reason (expands when Reject clicked) ── */}
            {rejectOpen && isPending && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason for rejection</p>
                <Textarea
                  autoFocus
                  placeholder="Explain why this request is being rejected…"
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setNotesError(false); }}
                  className={`text-sm min-h-[72px] ${notesError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  data-testid={`textarea-approval-notes-${req.id}`}
                />
                {notesError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />A reason is required to reject.
                  </p>
                )}
              </div>
            )}

            {/* ── Action buttons ── */}
            {isPending && (
              <DialogFooter className="flex-wrap gap-2 sm:justify-start pt-1">
                <Button
                  size="sm"
                  onClick={() => handleAction("approved")}
                  disabled={statusMutation.isPending}
                  data-testid={`btn-approve-${req.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleAction("rejected")}
                  disabled={statusMutation.isPending}
                  data-testid={`btn-reject-${req.id}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  {rejectOpen ? "Confirm Reject" : "Reject"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("under_review")}
                  disabled={statusMutation.isPending}
                  data-testid={`btn-send-back-${req.id}`}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />Send Back
                </Button>
                {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin self-center" />}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Pending Requests Queue ─────────────────────────────────────────────────────

function PendingRequestsQueue() {
  const [, setLocation] = useLocation();

  const { data: pending = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests/pending"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading pending requests…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-orange-500" />
        <h2 className="text-base font-semibold">Pending Requests</h2>
        <span className={`${PILL} bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800`}>
          {pending.length} awaiting approval
        </span>
      </div>
      {pending.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 shrink-0" />
            <div>
              <p className="font-medium text-sm">No pending requests</p>
              <p className="text-xs text-muted-foreground mt-0.5">All recruiting requests have been reviewed.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead className="bg-orange-50/60 dark:bg-orange-900/10 border-b">
              <tr>
                <Th>Submitted Date</Th>
                <Th>Request Origin</Th>
                <Th>Dealership</Th>
                <Th>Campaign Type</Th>
                <Th>Urgency</Th>
                <Th>Vehicle / Lic. Class</Th>
                <Th>Target #</Th>
                <Th>Target Fill Date</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pending.map((r, i) => (
                <tr
                  key={r.id}
                  data-testid={`row-pending-${r.id}`}
                  className={`cursor-pointer hover-elevate transition-colors ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                  onClick={() => setLocation(`/recruiting/campaigns/${r.id}`)}
                >
                  <Td className="whitespace-nowrap text-muted-foreground">{safeDate(r.submittedAt)}</Td>
                  <Td>{r.requestOrigin || <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="font-medium max-w-[160px]">
                    <span className="truncate block" title={r.dealershipName || ""}>{r.dealershipName || <span className="text-muted-foreground font-normal">—</span>}</span>
                  </Td>
                  <Td>{r.campaignType ? r.campaignType.charAt(0).toUpperCase() + r.campaignType.slice(1) : <span className="text-muted-foreground">—</span>}</Td>
                  <Td><UrgencyChip urgency={r.urgency} /></Td>
                  <Td>{r.vehicleLicenseClass || <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="tabular-nums">{r.targetDriverCount ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="whitespace-nowrap">{safeDate(r.targetDate)}</Td>
                  <Td><StatusBadge status={r.requestStatus} /></Td>
                  <Td><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Campaigns Table ────────────────────────────────────────────────────────────

/** Returns the canonical status used for filtering and badge rendering.
 *  - Pending requests (submitted / under_review) → "pending_approval"
 *  - Approved requests → normalise legacy requisition status values to
 *    the canonical set: active | paused | cancelled | closed
 *  - Approved with no linked requisition (null/draft) → "active"
 *  Note: "completed" is no longer a valid canonical status (DH-002085).
 *  The legacy requisition value "filled" now maps to "closed".
 */
function effectiveCampaignStatus(c: any): string {
  if (c.requestStatus === "submitted" || c.requestStatus === "under_review") {
    return "pending_approval";
  }
  const raw = c.campaignStatus as string | null | undefined;
  if (!raw || raw === "draft") return "active";
  // Normalise legacy requisition status values → canonical campaign status values
  const LEGACY: Record<string, string> = {
    open:        "active",
    open_active: "active",
    on_hold:     "paused",
    filled:      "closed",    // "filled" previously displayed as "Completed"; now maps to "closed" (DH-002085)
    completed:   "closed",    // safety fallback: any residual "completed" value renders as "closed"
  };
  return LEGACY[raw] ?? raw;
}

const EMPTY_FILTERS = {
  campaignType: ALL,
  urgency: ALL,
  driverClassification: ALL,
  vehicleLicenseClass: ALL,
  programType: ALL,
  employmentType: ALL,
  certLiaison: ALL,
};

function CampaignsTable({ externalSearch = "", onNewRequest, onCloneRequest }: { externalSearch?: string; onNewRequest?: () => void; onCloneRequest?: (campaign: any) => void }) {
  const [, setLocation]           = useLocation();
  const { user }                  = useAuth();
  const [editingCampaign, setEditingCampaign]     = useState<any>(null);
  const [archivingCampaign, setArchivingCampaign] = useState<any>(null);
  const [closingCampaign, setClosingCampaign]     = useState<any>(null);
  const [postClosedCampaign, setPostClosedCampaign] = useState<any>(null);
  const [addPostingCampaign, setAddPostingCampaign] = useState<any>(null);

  // ── Persisted list view prefs (filters, sort, status chips) ──
  // search is handled by parent via externalSearch prop
  const CAMPAIGNS_LIST_DEFAULTS = {
    filters: EMPTY_FILTERS as Record<string, string>,
    // "active" is the canonical value; "open" was the legacy requisition value.
    // moduleKey is versioned (v2) so stale prefs with "open" are discarded.
    selectedCampaignStatuses: ["pending_approval", "active"] as string[],
    sort: DEFAULT_SORT as SortState,
  };
  const { prefs, setPrefs, resetPrefs } = useListViewPrefs({
    moduleKey: "campaigns_v2",
    userId: user?.id,
    defaults: CAMPAIGNS_LIST_DEFAULTS,
  });
  const filters                  = prefs.filters;
  const selectedCampaignStatuses = prefs.selectedCampaignStatuses;
  const sort                     = prefs.sort;

  const {
    data: allRequests,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests"],
  });
  const hasCampaignData = allRequests !== undefined;

  // Approved + pending campaigns (submitted / under_review surface as pending_approval)
  const campaigns = useMemo(
    () => (allRequests ?? []).filter((r) =>
      r.requestStatus === "approved" ||
      r.approvalStatus === "approved" ||
      r.requestStatus === "submitted" ||
      r.requestStatus === "under_review"
    ),
    [allRequests],
  );

  // Derive unique values for filter dropdowns from the full campaign set
  const filterOptions = useMemo(() => ({
    campaignTypes:          uniq(campaigns.map((c) => c.campaignType ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1) : null)),
    urgencies:              uniq(campaigns.map((c) => c.urgency != null ? URGENCY_CHIP[c.urgency]?.label ?? String(c.urgency) : null)),
    driverClassifications:   uniq(campaigns.map((c) => c.driverClassification ? (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification) : null)),
    vehicleLicenseClasses:   uniq(campaigns.map((c) => c.vehicleLicenseClass)),
    programTypes:            uniq(campaigns.map((c) => c.programType ? (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType) : null)),
    employmentTypes:         uniq(campaigns.map((c) => c.employmentType)),
    certLiaisons:           uniq(campaigns.map((c) => c.certLiaison)),
  }), [campaigns]);

  // ── Filtering ──
  const filtered = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    return campaigns.filter((c) => {
      // Search: dealership, location (campaign label/code), market (city/state), driver type
      if (q) {
        const haystack = [c.dealershipName, c.location, c.market, c.marketCode, c.vehicleLicenseClass, c.programType, c.driverClassification, c.employmentType]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Multi-select: Campaign Status (uses effectiveCampaignStatus for pending_approval support)
      const effStatus = effectiveCampaignStatus(c);
      if (selectedCampaignStatuses.length > 0) {
        // OR logic: record passes if its status matches any selected value
        if (!selectedCampaignStatuses.includes(effStatus)) return false;
      } else {
        // Nothing selected → show all except terminal statuses
        if (effStatus === "closed" || effStatus === "cancelled") return false;
      }
      // Dropdown filters
      if (filters.campaignType !== ALL) {
        const label = c.campaignType ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1) : "";
        if (label !== filters.campaignType) return false;
      }
      if (filters.urgency !== ALL) {
        const label = c.urgency != null ? (URGENCY_CHIP[c.urgency]?.label ?? String(c.urgency)) : "";
        if (label !== filters.urgency) return false;
      }
      if (filters.driverClassification !== ALL && (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification) !== filters.driverClassification) return false;
      if (filters.vehicleLicenseClass  !== ALL && c.vehicleLicenseClass !== filters.vehicleLicenseClass) return false;
      if (filters.programType          !== ALL && (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType) !== filters.programType) return false;
      if (filters.employmentType       !== ALL && c.employmentType !== filters.employmentType) return false;
      if (filters.certLiaison          !== ALL && c.certLiaison !== filters.certLiaison) return false;
      return true;
    });
  }, [campaigns, externalSearch, filters, selectedCampaignStatuses]);

  // ── Sorting ──
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    const strSort = (av: string | null | undefined, bv: string | null | undefined) =>
      dir * (av ?? "").localeCompare(bv ?? "");
    arr.sort((a, b) => {
      switch (sort.key) {
        case "urgency": {
          // Primary: urgency color rank (Red=0 → Yellow=1 → other=2).
          // dir="desc" (default) = most urgent first; dir="asc" = least urgent first.
          const oda = calcOpenDays(a.campaignStartDate);
          const odb = calcOpenDays(b.campaignStartDate);
          const rankA = urgencyColorRank(a.urgency, oda);
          const rankB = urgencyColorRank(b.urgency, odb);
          const rankCmp = (rankA - rankB) * (sort.dir === "asc" ? -1 : 1);
          if (rankCmp !== 0) return rankCmp;
          // Secondary: open days descending (oldest campaign first within same color)
          return (odb - oda) * (sort.dir === "asc" ? -1 : 1);
        }
        case "openDays": {
          const da = calcOpenDays(a.campaignStartDate);
          const db = calcOpenDays(b.campaignStartDate);
          return dir * (da - db);
        }
        case "submittedAt": {
          const da = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const db = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return dir * (da - db);
        }
        case "campaignStartDate": {
          return strSort(a.campaignStartDate, b.campaignStartDate);
        }
        case "targetDate": {
          const da = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
          const db = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
          return dir * (da - db);
        }
        case "targetDriverCount":
          return dir * ((a.targetDriverCount ?? 0) - (b.targetDriverCount ?? 0));
        case "payRate":
          return dir * ((parseFloat(a.payRate) || 0) - (parseFloat(b.payRate) || 0));
        case "dealershipName":    return strSort(a.dealershipName, b.dealershipName);
        case "campaignType":      return strSort(a.campaignType, b.campaignType);
        case "driverClassification": return strSort(
          DRIVER_CLASS_DISPLAY[a.driverClassification] ?? a.driverClassification,
          DRIVER_CLASS_DISPLAY[b.driverClassification] ?? b.driverClassification,
        );
        case "programType":       return strSort(
          PROGRAM_TYPE_DISPLAY[a.programType] ?? a.programType,
          PROGRAM_TYPE_DISPLAY[b.programType] ?? b.programType,
        );
        case "employmentType":    return strSort(a.employmentType, b.employmentType);
        case "certLiaison":       return strSort(a.certLiaison, b.certLiaison);
        case "campaignStatus":    return strSort(a.campaignStatus, b.campaignStatus);
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sort]);

  // ── Active campaign counts ───────────────────────────────────────────────────
  // These ALWAYS reference effectiveCampaignStatus === "active" regardless of the
  // status-chip selection, so the "Active Campaigns" label has a fixed meaning.
  // active_total_count   = all campaigns with status Active (ticket spec)
  // active_filtered_count = active campaigns matching search + non-status filters
  const activeTotalCount = useMemo(
    () => campaigns.filter(c => effectiveCampaignStatus(c) === "active").length,
    [campaigns],
  );

  const activeFilteredCount = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    return campaigns.filter(c => {
      if (effectiveCampaignStatus(c) !== "active") return false;
      if (q) {
        const haystack = [
          c.dealershipName, c.location, c.market, c.marketCode,
          c.vehicleLicenseClass, c.programType, c.driverClassification, c.employmentType,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.campaignType !== ALL) {
        const label = c.campaignType
          ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1)
          : "";
        if (label !== filters.campaignType) return false;
      }
      if (filters.urgency !== ALL) {
        const label = c.urgency != null
          ? (URGENCY_CHIP[c.urgency]?.label ?? String(c.urgency))
          : "";
        if (label !== filters.urgency) return false;
      }
      if (filters.driverClassification !== ALL &&
          (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification) !== filters.driverClassification) return false;
      if (filters.vehicleLicenseClass  !== ALL && c.vehicleLicenseClass  !== filters.vehicleLicenseClass)  return false;
      if (filters.programType          !== ALL &&
          (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType) !== filters.programType)                  return false;
      if (filters.employmentType       !== ALL && c.employmentType       !== filters.employmentType)       return false;
      if (filters.certLiaison          !== ALL && c.certLiaison          !== filters.certLiaison)          return false;
      return true;
    }).length;
  }, [campaigns, externalSearch, filters]);

  function handleSort(key: SortKey) {
    setPrefs({ sort: { key, dir: nextDir(prefs.sort, key) } });
  }

  function handleFilter(key: string, val: string) {
    setPrefs({ filters: { ...prefs.filters, [key]: val } });
  }

  const activeFilterCount = [
    externalSearch.trim() ? 1 : 0,
    selectedCampaignStatuses.length > 0 ? 1 : 0,
    ...Object.values(filters).map((v) => (v !== ALL ? 1 : 0)),
  ].reduce((a, b) => a + b, 0);

  function clearAll() {
    setPrefs({ filters: EMPTY_FILTERS, selectedCampaignStatuses: [] });
  }

  if (isLoading || (isError && isFetching && !hasCampaignData)) {
    return <RecruitingCampaignListLoading kind="active" />;
  }

  if (isError && !hasCampaignData) {
    return (
      <RecruitingCampaignListError
        kind="active"
        isRetrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-2">
      {isError && hasCampaignData && (
        <RecruitingCampaignListError
          kind="active"
          isRetrying={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      {/* ── Active Campaigns section header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-foreground/80 uppercase tracking-wide">Active Campaigns</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {`Showing ${activeFilteredCount} of ${activeTotalCount} Active Campaign${activeTotalCount !== 1 ? "s" : ""}`}
          </span>
        </div>
        {/* Reset View — visible whenever prefs differ from system defaults */}
        {(activeFilterCount > 0 ||
          prefs.sort.key !== DEFAULT_SORT.key ||
          prefs.sort.dir !== DEFAULT_SORT.dir) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground gap-1"
            onClick={resetPrefs}
            data-testid="btn-reset-view"
          >
            <RotateCcw className="h-3 w-3" />Reset View
          </Button>
        )}
      </div>
      {/* Filter bar — only show if there's data to filter */}
      {campaigns.length > 0 && (
        <FilterBar
          filters={filters}
          onFilter={handleFilter}
          onClear={clearAll}
          options={filterOptions}
          activeCount={activeFilterCount}
          campaignStatuses={selectedCampaignStatuses}
          onCampaignStatuses={(v) => setPrefs({ selectedCampaignStatuses: v })}
        />
      )}

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-3">
            <Rocket className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-semibold text-base">No Active Recruiting Campaigns</p>
              <p className="text-sm text-muted-foreground mt-1">
                Approved recruiting requests will appear here as active campaigns.
              </p>
              <Button
                size="sm"
                onClick={() => onNewRequest?.()}
                data-testid="btn-create-recruiting-request-empty"
              >
                Create Recruiting Request
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <Search className="h-8 w-8 text-muted-foreground/30" />
            {activeFilterCount === 0 ? (
              <div>
                <p className="font-medium text-sm">All campaigns are closed or cancelled</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the Campaign Status filter to view closed or cancelled campaigns.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-sm">No campaigns match your filters</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters.</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={clearAll} data-testid="btn-clear-filters-empty">
              <FilterX className="h-3.5 w-3.5 mr-1.5" />Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse">
              <thead className="bg-[#f7f8fb] dark:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                <tr>
                  {/* 1 — Account (frozen) */}
                  <Th sticky sortKey="dealershipName" sort={sort} onSort={handleSort}>Account</Th>
                  {/* 2 — Urgency */}
                  <Th center sortKey="urgency" sort={sort} onSort={handleSort}>Urgency</Th>
                  {/* 3 — Status */}
                  <Th center sortKey="campaignStatus" sort={sort} onSort={handleSort}>Status</Th>
                  {/* 4 — Open Days */}
                  <Th center sortKey="openDays" sort={sort} onSort={handleSort}>
                    Open<br/>Days
                  </Th>
                  {/* 5 — Target Drivers */}
                  <Th center sortKey="targetDriverCount" sort={sort} onSort={handleSort}>
                    Target<br/>Drivers
                  </Th>
                  {/* 6 — Driver Classification */}
                  <Th center sortKey="driverClassification" sort={sort} onSort={handleSort}>
                    Driver<br/>Classification
                  </Th>
                  {/* 7 — Driver Type */}
                  <Th center sortKey="programType" sort={sort} onSort={handleSort}>
                    Driver<br/>Type
                  </Th>
                  {/* 8 — Employment Type */}
                  <Th center sortKey="employmentType" sort={sort} onSort={handleSort}>
                    Employment<br/>Type
                  </Th>
                  {/* 9 — Campaign Type */}
                  <Th center sortKey="campaignType" sort={sort} onSort={handleSort}>
                    Campaign<br/>Type
                  </Th>
                  {/* 10 — Pay Rate */}
                  <Th right sortKey="payRate" sort={sort} onSort={handleSort}>
                    Pay<br/>Rate
                  </Th>
                  {/* 11 — Start Date */}
                  <Th center sortKey="campaignStartDate" sort={sort} onSort={handleSort}>
                    Start<br/>Date
                  </Th>
                  {/* 12 — Target Completion */}
                  <Th center sortKey="targetDate" sort={sort} onSort={handleSort}>
                    Target<br/>Completion
                  </Th>
                  {/* 13 — Cert Liaison */}
                  <Th center sortKey="certLiaison" sort={sort} onSort={handleSort}>
                    Cert<br/>Liaison
                  </Th>
                  {/* 14 — Actions */}
                  <Th center></Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((c, i) => {
                  const openDays = calcOpenDays(c.campaignStartDate);
                  return (
                  <tr
                    key={c.id}
                    data-testid={`row-campaign-${c.id}`}
                    className="cursor-pointer hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10 border-b border-[#eceef3] dark:border-border last:border-0 transition-colors"
                    onClick={() => setLocation(`/recruiting/campaigns/${c.id}`)}
                  >
                    {/* 1 — Account (frozen) */}
                    <Td className="font-medium max-w-[180px] sticky left-0 z-10 bg-inherit border-r border-border/60">
                      {c.additionalComments ? (
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <span
                              className="truncate block underline decoration-dotted underline-offset-2 decoration-muted-foreground/50 cursor-default"
                              title={c.dealershipName || "—"}
                            >
                              {c.dealershipName || <span className="text-muted-foreground font-normal">—</span>}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="right"
                            align="start"
                            avoidCollisions
                            className="w-[420px] p-3 text-sm"
                          >
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-2">
                              Campaign Notes
                            </p>
                            <div className="max-h-44 overflow-y-auto pr-0.5">
                              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                                {c.additionalComments.length > 400
                                  ? c.additionalComments.slice(0, 400).trimEnd() + "…"
                                  : c.additionalComments}
                              </p>
                            </div>
                            {c.additionalComments.length > 400 && (
                              <button
                                className="mt-2 text-[11px] font-medium text-primary hover:underline"
                                onClick={() => setLocation(`/recruiting/campaigns/${c.id}`)}
                              >
                                View full campaign details →
                              </button>
                            )}
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        <span className="truncate block" title={c.dealershipName || "—"}>
                          {c.dealershipName || <span className="text-muted-foreground font-normal">—</span>}
                        </span>
                      )}
                      {c.location && (
                        <span className="text-[10px] text-muted-foreground block mt-0.5">{c.location}</span>
                      )}
                    </Td>
                    {/* 2 — Urgency */}
                    <Td className="text-center"><UrgencyChip urgency={c.urgency} openDays={openDays} /></Td>
                    {/* 3 — Status */}
                    <Td className="text-center"><CampaignStatusBadgeAged status={effectiveCampaignStatus(c)} openDays={openDays} /></Td>
                    {/* 4 — Open Days */}
                    <Td className="text-center tabular-nums">{openDays}</Td>
                    {/* 5 — Target Drivers */}
                    <Td className="text-center tabular-nums">{c.targetDriverCount ?? <span className="text-muted-foreground">—</span>}</Td>
                    {/* 6 — Driver Classification */}
                    <Td className="text-center">
                      {c.driverClassification
                        ? (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification)
                        : <span className="text-muted-foreground">—</span>}
                    </Td>
                    {/* 7 — Driver Type */}
                    <Td className="text-center">
                      {c.programType
                        ? (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType)
                        : <span className="text-muted-foreground">—</span>}
                    </Td>
                    {/* 8 — Employment Type */}
                    <Td className="text-center">{c.employmentType || <span className="text-muted-foreground">—</span>}</Td>
                    {/* 9 — Campaign Type */}
                    <Td className="text-center">
                      {c.campaignType
                        ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1)
                        : <span className="text-muted-foreground">—</span>}
                    </Td>
                    {/* 10 — Pay Rate */}
                    <Td className="tabular-nums text-right">{formatPayRate(c.payRate)}</Td>
                    {/* 11 — Start Date */}
                    <Td className="text-center whitespace-nowrap">{safeDate(c.campaignStartDate)}</Td>
                    {/* 12 — Target Completion */}
                    <Td className="text-center whitespace-nowrap">{safeDate(c.targetDate)}</Td>
                    {/* 13 — Cert Liaison */}
                    <Td className="text-center">{c.certLiaison || <span className="text-muted-foreground">—</span>}</Td>
                    {/* 14 — Actions */}
                    <Td onClick={(e) => e.stopPropagation()} className="text-center pr-2">
                       {/* View Details remains available; mutations follow Recruiting posting access. */}
                      {(!!user) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`btn-campaign-row-menu-${c.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => setLocation(`/recruiting/campaigns/${c.id}`)}
                              data-testid={`menu-item-view-${c.id}`}
                            >
                              <ChevronRight className="h-3.5 w-3.5 mr-2" />View Details
                            </DropdownMenuItem>
                            {canEditCampaign(user?.role) && (
                              <DropdownMenuItem
                                onSelect={() => setEditingCampaign(c)}
                                data-testid={`menu-item-edit-${c.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2" />Edit Campaign
                              </DropdownMenuItem>
                            )}
                            {canManageJobPostings(c.canManageJobPostings) && (
                              <DropdownMenuItem
                                onSelect={() => setAddPostingCampaign(c)}
                                data-testid={`menu-item-add-posting-${c.id}`}
                              >
                                <Globe className="h-3.5 w-3.5 mr-2" />Add Job Posting
                              </DropdownMenuItem>
                            )}
                            {canEditCampaign(user?.role) && c.campaignStatus !== "closed" && (
                              <DropdownMenuItem
                                onSelect={() => setClosingCampaign(c)}
                                data-testid={`menu-item-close-${c.id}`}
                                className="text-muted-foreground"
                              >
                                <CircleX className="h-3.5 w-3.5 mr-2" />Close Campaign
                              </DropdownMenuItem>
                            )}
                            {canCloneRequest(user?.role) && c.campaignStatus === "closed" && (
                              <DropdownMenuItem
                                onSelect={() => onCloneRequest?.(c)}
                                data-testid={`menu-item-clone-request-${c.id}`}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" />Clone as New Request
                              </DropdownMenuItem>
                            )}
                            {canArchiveCampaign(user?.role) && (
                              <DropdownMenuItem
                                onSelect={() => setArchivingCampaign(c)}
                                data-testid={`menu-item-archive-${c.id}`}
                                className="text-muted-foreground"
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" />Archive Campaign
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </Td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Edit Campaign Modal (from row menu) ── */}
      <EditCampaignModal
        campaign={editingCampaign}
        open={!!editingCampaign}
        onClose={() => setEditingCampaign(null)}
      />

      {/* ── Archive Campaign Dialog (from row menu) ── */}
      <ArchiveCampaignDialog
        open={!!archivingCampaign}
        campaign={archivingCampaign}
        onClose={() => setArchivingCampaign(null)}
        onArchived={() => setArchivingCampaign(null)}
      />

      {/* ── Close Campaign Dialog (from row menu) ── */}
      <CloseCampaignDialog
        open={!!closingCampaign}
        campaign={closingCampaign}
        onClose={() => setClosingCampaign(null)}
        onClosed={() => {
          const c = closingCampaign;
          setClosingCampaign(null);
          setPostClosedCampaign(c);
        }}
      />

      {/* ── Post-close prompt (from row menu) ── */}
      <PostClosePromptDialog
        campaign={postClosedCampaign}
        onClone={() => {
          const c = postClosedCampaign;
          setPostClosedCampaign(null);
          onCloneRequest?.(c);
        }}
        onReturn={() => {
          const c = postClosedCampaign;
          setPostClosedCampaign(null);
          // Navigate to the campaign's detail page so user can see it
          if (c?.id) setLocation(`/recruiting/campaigns/${c.id}`);
        }}
      />

      {/* ── Add Job Posting Dialog (from row Quick Actions menu) ── */}
      {addPostingCampaign && (
        <AddJobPostingDialog
          open={!!addPostingCampaign}
          onOpenChange={(v) => { if (!v) setAddPostingCampaign(null); }}
          campaignId={addPostingCampaign.id}
          onSuccess={() => setAddPostingCampaign(null)}
        />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ActiveCampaignsList({ externalSearch = "", onNewRequest, onCloneRequest }: { externalSearch?: string; onNewRequest?: () => void; onCloneRequest?: (campaign: any) => void }) {
  const { user }       = useAuth();
  const [location]     = useLocation();
  const savedScrollY   = useRef(0);

  const pathParts = location.startsWith("/recruiting/campaigns/")
    ? location.replace("/recruiting/campaigns/", "").split("?")[0].split("/")
    : [];
  const campaignId = pathParts[0] || null;
  const subPage    = pathParts[1] || null;

  // Save/restore scroll position when navigating between list and detail views.
  // In-memory ref handles within-session navigation; localStorage handles page reloads.
  useEffect(() => {
    if (campaignId) {
      // Entering detail: capture current scroll and move to top for the detail view.
      savedScrollY.current = window.scrollY;
      saveScrollPosition(user?.id, "campaigns");
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } else {
      // Returning to list: prefer in-memory value (within-session), fall back to
      // localStorage (cross-session / page reload). rAF waits for list repaint.
      const y = savedScrollY.current || readScrollPosition(user?.id, "campaigns");
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    }
  }, [campaignId, user?.id]);

  return (
    <>
      {/* List — always mounted so filters, sort, and search state survive
          navigation to a detail view. Hidden via CSS, not unmounted. */}
      <div className={campaignId ? "hidden" : undefined}>
        <CampaignsTable externalSearch={externalSearch} onNewRequest={onNewRequest} onCloneRequest={onCloneRequest} />
      </div>

      {/* Detail views — rendered only when a campaign is selected */}
      {campaignId && subPage === "workspace" && <CampaignWorkspace requestId={campaignId} />}
      {campaignId && !subPage && <CampaignDetailView campaignId={campaignId} onCloneRequest={onCloneRequest} />}
    </>
  );
}
