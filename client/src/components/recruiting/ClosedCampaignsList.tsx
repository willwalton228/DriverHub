import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/dateFormat";
import {
  Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, FilterX, SlidersHorizontal,
  Download, Pencil, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RecruitingCampaignListError,
  RecruitingCampaignListLoading,
} from "./RecruitingCampaignListStates";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClosedCampaign {
  id: string;
  campaignName: string;
  requestId: string | null;
  startDate: string | null;
  endDate: string | null;          // Target Completion Date
  closedAt: string | null;         // Actual Closing Date
  targetDriverCount: number;
  urgencyLevel: string | null;
  status: string;
  dealershipName: string | null;
  location: string | null;
  additionalComments: string | null;
  certLiaison: string | null;
  urgency: number | null;
  campaignType: string | null;
  driverClassification: string | null;
  programType: string | null;
  employmentType: string | null;
  accountId: string | null;
  actualClosingDate: string | null;
  closedByName: string | null;
  missingClosingDate?: boolean;
  hiredDriversCount: number;
  wiwHoursLast30: number | null;
  openDays: number | null;
  scheduleVariance: number | null;
}

interface ActivatedDriver {
  driverId: string;
  displayName: string;
  employeeId: string | null;
  currentStatus: string | null;
  driverClassification: string | null;
  driverType: string | null;
  employmentType: string | null;
  activationDate: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL = "__all__";

// Urgency: semantic text treatment only — no colored background pills.
// Critical and High carry operational urgency → semantic red/orange text.
// Others are informational → plain or muted text.
const URGENCY_CONFIG: Record<number, { label: string; cls: string }> = {
  1: { label: "Maintenance / Back Up",  cls: "text-muted-foreground" },
  2: { label: "Med-Low",                cls: "text-muted-foreground" },
  3: { label: "Normal",                 cls: "text-foreground" },
  4: { label: "High",                   cls: "text-orange-600 font-semibold" },
  5: { label: "Critical",               cls: "text-red-600 font-semibold" },
};

const DRIVER_CLASS_DISPLAY: Record<string, string> = {
  independent_contractor: "Independent Contractor",
  employee:               "Employee",
  "Independent Contractor": "Independent Contractor",
  Employee:               "Employee",
};

const PROGRAM_TYPE_DISPLAY: Record<string, string> = {
  driver_dash:  "DriverDash",
  driver_shift: "DriverShift",
  DriverDash:   "DriverDash",
  DriverShift:  "DriverShift",
  Hybrid:       "Hybrid",
};

// ── Utility functions ─────────────────────────────────────────────────────────

function safeDate(val: string | null | undefined): string {
  return formatDate(val);
}

function urgencyLabel(urgency: number | null): string {
  if (urgency == null) return "—";
  return URGENCY_CONFIG[urgency]?.label ?? String(urgency);
}

function schedVarianceLabel(v: number | null): { text: string; cls: string } {
  if (v === null) return { text: "—",     cls: "text-muted-foreground" };
  if (v > 0)  return { text: `${v}d Early`,  cls: "text-green-600 font-medium" };
  if (v === 0) return { text: "On Time",  cls: "text-green-600 font-medium" };
  return        { text: `${Math.abs(v)}d Late`, cls: "text-red-600 font-medium" };
}

function schedVarianceBucket(v: number | null): "early" | "on-time" | "late" | null {
  if (v === null) return null;
  if (v > 0)  return "early";
  if (v === 0) return "on-time";
  return "late";
}

function wiwDisplay(hours: number | null, hiredCount: number): { text: string; cls: string } {
  if (hours === null) {
    if (hiredCount > 0) return { text: "Data unavailable", cls: "text-muted-foreground italic" };
    return { text: "—", cls: "text-muted-foreground" };
  }
  return { text: hours.toFixed(1) + " h", cls: "" };
}

function uniq(arr: (string | null | undefined)[]): string[] {
  return Array.from(new Set(arr.filter(Boolean) as string[])).sort();
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey =
  | "account" | "urgency" | "openDays" | "targetDrivers" | "hiredDrivers"
  | "wiwHours" | "startDate" | "targetCompletion" | "closingDate"
  | "scheduleVariance" | "certLiaison";
type SortDir = "asc" | "desc";
interface SortState { key: SortKey; dir: SortDir }

const DEFAULT_SORT: SortState = { key: "closingDate", dir: "desc" };

function nextDir(cur: SortState, key: SortKey): SortDir {
  if (cur.key !== key) return "asc";
  return cur.dir === "asc" ? "desc" : "asc";
}

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />;
  return sort.dir === "asc"
    ? <ArrowUp   className="h-3 w-3 text-primary shrink-0" />
    : <ArrowDown className="h-3 w-3 text-primary shrink-0" />;
}

// ── Table primitives ──────────────────────────────────────────────────────────

function Th({
  children, sortKey, sort, onSort, right = false, center = false, sticky = false, wrap = false,
}: {
  children: React.ReactNode;
  sortKey?: SortKey;
  sort?: SortState;
  onSort?: (k: SortKey) => void;
  right?: boolean;
  center?: boolean;
  sticky?: boolean;
  wrap?: boolean;
}) {
  const align = right ? "text-right" : center ? "text-center" : "text-left";
  // Claims list uses text-[14px] font-semibold text-foreground/80 for headers.
  // Our table is denser with more columns — keep text-[11px] uppercase treatment.
  const base = `text-[11px] font-semibold text-foreground/70 uppercase tracking-wider px-3 py-2 leading-tight ${wrap ? "" : "whitespace-nowrap"}`;
  const stickyClass = sticky ? " sticky left-0 z-20 bg-[#f7f8fb] dark:bg-muted/30 border-r border-border/60" : "";
  if (sortKey && sort && onSort) {
    return (
      <th
        className={`${base}${stickyClass} select-none cursor-pointer hover:text-foreground transition-colors`}
        onClick={() => onSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${center ? "justify-center" : right ? "justify-end" : "justify-start"}`}>
          <span>{children}</span>
          <SortIcon col={sortKey} sort={sort} />
        </div>
      </th>
    );
  }
  return <th className={`${base}${stickyClass} ${align}`}>{children}</th>;
}

// Body cell — 13px body consistent with Claims table body
function Td({ children, className = "", ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
  return <td className={`px-3 py-2 text-[13px] align-middle ${className}`} {...rest}>{children}</td>;
}

// ── KPI grid — Claims Dashboard KpiCard style ─────────────────────────────────

function KpiGrid({ items }: {
  items: { label: string; value: string | number; sub?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {items.map(({ label, value, sub }) => (
        <div key={label} className="border border-border/50 rounded-lg shadow-none bg-white dark:bg-card px-2.5 py-2">
          {/* Label — Claims: text-[10px] font-medium uppercase tracking-wider */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
          {/* Value — Claims: text-xl font-bold tabular-nums */}
          <p className="text-xl font-bold tabular-nums leading-tight mt-0.5 text-[#182039] dark:text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Filter select ─────────────────────────────────────────────────────────────

function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const isActive = value !== ALL;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-8 text-xs w-[130px] border-[#cfd4df] dark:border-border${isActive ? " border-primary/50 text-primary" : ""}`}>
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

// ── Hired Drivers Dialog ──────────────────────────────────────────────────────

function HiredDriversDialog({
  campaign, open, onClose,
}: {
  campaign: ClosedCampaign | null;
  open: boolean;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const requestId = campaign?.requestId;
  const { data: drivers = [], isLoading } = useQuery<ActivatedDriver[]>({
    queryKey: ["/api/recruiting/requests", requestId, "activated-drivers"],
    queryFn: async () => {
      if (!requestId) return [];
      const r = await fetch(`/api/recruiting/requests/${requestId}/activated-drivers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open && !!requestId,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Hired Drivers — {campaign?.dealershipName ?? campaign?.campaignName ?? "Campaign"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            No drivers linked to this campaign yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Driver</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Classification</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Employment</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Activation</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {drivers.map((d) => (
                  <tr key={d.driverId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2">
                      <button
                        className="text-primary hover:underline font-medium text-left text-[13px]"
                        onClick={() => { onClose(); setLocation(`/drivers/${d.driverId}`); }}
                      >
                        {d.displayName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[13px] text-muted-foreground">{d.employeeId ?? "—"}</td>
                    <td className="px-3 py-2 text-[13px]">{d.driverClassification ? (DRIVER_CLASS_DISPLAY[d.driverClassification] ?? d.driverClassification) : "—"}</td>
                    <td className="px-3 py-2 text-[13px]">{d.driverType ? (PROGRAM_TYPE_DISPLAY[d.driverType] ?? d.driverType) : "—"}</td>
                    <td className="px-3 py-2 text-[13px]">{d.employmentType ?? "—"}</td>
                    <td className="px-3 py-2 text-[13px] whitespace-nowrap text-muted-foreground">{safeDate(d.activationDate)}</td>
                    <td className="px-3 py-2 text-[13px]">
                      {d.currentStatus ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── DH-002168: Edit Closing Date Dialog ───────────────────────────────────────

function EditClosingDateDialog({
  campaign, open, onClose,
}: {
  campaign: ClosedCampaign | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const todayISO = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (open && campaign) {
      setNewDate(campaign.actualClosingDate?.slice(0, 10) || todayISO);
      setReason("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/recruiting/campaigns/${campaign!.id}/closing-date`, {
        actualClosingDate: newDate,
        reason,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || "Failed to update closing date");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/campaigns/closed"] });
      toast({ title: "Closing date updated" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const canSubmit = newDate && newDate <= todayISO && reason.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Closing Date</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Correct the actual date this campaign was closed.
            {campaign?.actualClosingDate && (
              <span className="block mt-1">
                Current: <strong>{safeDate(campaign.actualClosingDate)}</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Actual Closing Date <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              value={newDate}
              max={todayISO}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Reason for Change <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this date being corrected?"
              className="text-sm min-h-[68px] resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClosedCampaignsList({ externalSearch = "" }: { externalSearch?: string }) {
  const [, setLocation] = useLocation();

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  // Filters
  const [filterAccount,       setFilterAccount]       = useState(ALL);
  const [filterUrgency,       setFilterUrgency]       = useState(ALL);
  const [filterDriverClass,   setFilterDriverClass]   = useState(ALL);
  const [filterDriverType,    setFilterDriverType]    = useState(ALL);
  const [filterEmpType,       setFilterEmpType]       = useState(ALL);
  const [filterCampaignType,  setFilterCampaignType]  = useState(ALL);
  const [filterCertLiaison,   setFilterCertLiaison]   = useState(ALL);
  const [filterSchedVariance, setFilterSchedVariance] = useState(ALL);
  const [filterStartFrom,     setFilterStartFrom]     = useState("");
  const [filterStartTo,       setFilterStartTo]       = useState("");
  const [filterClosingFrom,   setFilterClosingFrom]   = useState("");
  const [filterClosingTo,     setFilterClosingTo]     = useState("");

  const [driversCampaign,  setDriversCampaign]  = useState<ClosedCampaign | null>(null);
  const [editDateCampaign, setEditDateCampaign] = useState<ClosedCampaign | null>(null);

  const {
    data: campaignData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<ClosedCampaign[]>({
    queryKey: ["/api/recruiting/campaigns/closed"],
  });
  const campaigns = campaignData ?? [];
  const hasCampaignData = campaignData !== undefined;

  // Filter options from full dataset
  const filterOpts = useMemo(() => ({
    accounts:      uniq(campaigns.map((c) => c.dealershipName)),
    urgencies:     uniq(campaigns.map((c) => c.urgency != null ? urgencyLabel(c.urgency) : null)),
    driverClasses: uniq(campaigns.map((c) => c.driverClassification ? (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification) : null)),
    driverTypes:   uniq(campaigns.map((c) => c.programType ? (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType) : null)),
    empTypes:      uniq(campaigns.map((c) => c.employmentType)),
    campaignTypes: uniq(campaigns.map((c) => c.campaignType ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1) : null)),
    certLiaisons:  uniq(campaigns.map((c) => c.certLiaison)),
  }), [campaigns]);

  // Filtered dataset
  const filtered = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q) {
        const hay = [c.dealershipName, c.location, c.certLiaison, c.campaignName]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterAccount !== ALL && (c.dealershipName ?? "") !== filterAccount) return false;
      if (filterUrgency !== ALL) {
        if (urgencyLabel(c.urgency) !== filterUrgency) return false;
      }
      if (filterDriverClass !== ALL) {
        const label = c.driverClassification ? (DRIVER_CLASS_DISPLAY[c.driverClassification] ?? c.driverClassification) : "";
        if (label !== filterDriverClass) return false;
      }
      if (filterDriverType !== ALL) {
        const label = c.programType ? (PROGRAM_TYPE_DISPLAY[c.programType] ?? c.programType) : "";
        if (label !== filterDriverType) return false;
      }
      if (filterEmpType !== ALL && (c.employmentType ?? "") !== filterEmpType) return false;
      if (filterCampaignType !== ALL) {
        const label = c.campaignType ? c.campaignType.charAt(0).toUpperCase() + c.campaignType.slice(1) : "";
        if (label !== filterCampaignType) return false;
      }
      if (filterCertLiaison !== ALL && (c.certLiaison ?? "") !== filterCertLiaison) return false;
      if (filterSchedVariance !== ALL) {
        if (schedVarianceBucket(c.scheduleVariance) !== filterSchedVariance) return false;
      }
      if (filterStartFrom && c.startDate && c.startDate < filterStartFrom) return false;
      if (filterStartTo   && c.startDate && c.startDate > filterStartTo)   return false;
      const closingStr = c.actualClosingDate
        ? c.actualClosingDate.slice(0, 10)
        : c.closedAt ? c.closedAt.slice(0, 10) : null;
      if (filterClosingFrom && closingStr && closingStr < filterClosingFrom) return false;
      if (filterClosingTo   && closingStr && closingStr > filterClosingTo)   return false;
      return true;
    });
  }, [
    campaigns, externalSearch,
    filterAccount, filterUrgency, filterDriverClass, filterDriverType,
    filterEmpType, filterCampaignType, filterCertLiaison, filterSchedVariance,
    filterStartFrom, filterStartTo, filterClosingFrom, filterClosingTo,
  ]);

  // Sorted dataset
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sort.key) {
        case "account":          av = a.dealershipName ?? ""; bv = b.dealershipName ?? ""; break;
        case "urgency":          av = a.urgency ?? 99;        bv = b.urgency ?? 99;        break;
        case "openDays":         av = a.openDays ?? -1;       bv = b.openDays ?? -1;       break;
        case "targetDrivers":    av = a.targetDriverCount;    bv = b.targetDriverCount;    break;
        case "hiredDrivers":     av = a.hiredDriversCount;    bv = b.hiredDriversCount;    break;
        case "wiwHours":         av = a.wiwHoursLast30 ?? -1; bv = b.wiwHoursLast30 ?? -1; break;
        case "startDate":        av = a.startDate ?? "";      bv = b.startDate ?? "";      break;
        case "targetCompletion": av = a.endDate ?? "";        bv = b.endDate ?? "";        break;
        case "closingDate":      av = a.actualClosingDate ?? a.closedAt ?? ""; bv = b.actualClosingDate ?? b.closedAt ?? ""; break;
        case "scheduleVariance": av = a.scheduleVariance ?? -9999; bv = b.scheduleVariance ?? -9999; break;
        case "certLiaison":      av = a.certLiaison ?? "";    bv = b.certLiaison ?? "";    break;
        default: return 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sort]);

  // Summary KPIs (reflect current filtered set)
  const summary = useMemo(() => {
    const total       = filtered.length;
    const totalTarget = filtered.reduce((s, c) => s + (c.targetDriverCount ?? 0), 0);
    const totalHired  = filtered.reduce((s, c) => s + (c.hiredDriversCount ?? 0), 0);
    const fillRate    = totalTarget > 0 ? Math.round((totalHired / totalTarget) * 100) : 0;
    const withTarget  = filtered.filter((c) => c.endDate && (c.actualClosingDate || c.closedAt));
    const onTime      = withTarget.filter((c) => (c.scheduleVariance ?? -1) >= 0).length;
    const onTimeRate  = withTarget.length > 0 ? Math.round((onTime / withTarget.length) * 100) : null;
    return { total, totalTarget, totalHired, fillRate, onTimeRate };
  }, [filtered]);

  // Active filter state
  const hasActiveFilters = [
    filterAccount, filterUrgency, filterDriverClass, filterDriverType,
    filterEmpType, filterCampaignType, filterCertLiaison, filterSchedVariance,
    filterStartFrom, filterStartTo, filterClosingFrom, filterClosingTo,
  ].some((v) => v !== ALL && v !== "");

  // Filter chips — Claims pattern: descriptive labels for each active filter
  const filterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filterAccount      !== ALL)  chips.push({ key: "account",      label: `Account: ${filterAccount}` });
    if (filterUrgency      !== ALL)  chips.push({ key: "urgency",      label: `Urgency: ${filterUrgency}` });
    if (filterDriverClass  !== ALL)  chips.push({ key: "driverClass",  label: `Class: ${filterDriverClass}` });
    if (filterDriverType   !== ALL)  chips.push({ key: "driverType",   label: `Type: ${filterDriverType}` });
    if (filterEmpType      !== ALL)  chips.push({ key: "empType",      label: `Employment: ${filterEmpType}` });
    if (filterCampaignType !== ALL)  chips.push({ key: "campaignType", label: `Campaign: ${filterCampaignType}` });
    if (filterCertLiaison  !== ALL)  chips.push({ key: "certLiaison",  label: `Liaison: ${filterCertLiaison}` });
    if (filterSchedVariance !== ALL) chips.push({ key: "variance",     label: `Variance: ${filterSchedVariance}` });
    if (filterStartFrom)             chips.push({ key: "startFrom",    label: `Start From: ${filterStartFrom}` });
    if (filterStartTo)               chips.push({ key: "startTo",      label: `Start To: ${filterStartTo}` });
    if (filterClosingFrom)           chips.push({ key: "closingFrom",  label: `Closed From: ${filterClosingFrom}` });
    if (filterClosingTo)             chips.push({ key: "closingTo",    label: `Closed To: ${filterClosingTo}` });
    return chips;
  }, [
    filterAccount, filterUrgency, filterDriverClass, filterDriverType,
    filterEmpType, filterCampaignType, filterCertLiaison, filterSchedVariance,
    filterStartFrom, filterStartTo, filterClosingFrom, filterClosingTo,
  ]);

  function clearFilters() {
    setFilterAccount(ALL); setFilterUrgency(ALL); setFilterDriverClass(ALL);
    setFilterDriverType(ALL); setFilterEmpType(ALL); setFilterCampaignType(ALL);
    setFilterCertLiaison(ALL); setFilterSchedVariance(ALL);
    setFilterStartFrom(""); setFilterStartTo(""); setFilterClosingFrom(""); setFilterClosingTo("");
  }

  function handleSort(key: SortKey) {
    setSort({ key, dir: nextDir(sort, key) });
  }

  // ── Export ────────────────────────────────────────────────────────────────

  function exportCsv() {
    const headers = [
      "Account", "Urgency", "Open Days", "Target Drivers", "Hired Drivers",
      "Fill Rate", "WIW Hours – Last 30 Days", "Start Date", "Target Completion",
      "Actual Closing Date", "Schedule Variance", "Cert Liaison",
    ];
    const rows = sorted.map((c) => {
      const uLabel  = urgencyLabel(c.urgency);
      const varLabel = schedVarianceLabel(c.scheduleVariance).text;
      const fillPct  = c.targetDriverCount > 0
        ? Math.round((c.hiredDriversCount / c.targetDriverCount) * 100) + "%"
        : "—";
      return [
        c.dealershipName ?? "",
        uLabel,
        c.openDays != null ? String(c.openDays) : "",
        String(c.targetDriverCount),
        String(c.hiredDriversCount),
        fillPct,
        wiwDisplay(c.wiwHoursLast30, c.hiredDriversCount).text,
        safeDate(c.startDate),
        safeDate(c.endDate),
        safeDate(c.actualClosingDate ?? c.closedAt),
        varLabel,
        c.certLiaison ?? "",
      ].map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
    });
    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `closed-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading || (isError && isFetching && !hasCampaignData)) {
    return <RecruitingCampaignListLoading kind="closed" />;
  }

  if (isError && !hasCampaignData) {
    return (
      <RecruitingCampaignListError
        kind="closed"
        isRetrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-2">
      {isError && hasCampaignData && (
        <RecruitingCampaignListError
          kind="closed"
          isRetrying={isFetching}
          onRetry={() => void refetch()}
        />
      )}

      {/* ── Command bar: count + primary filters + advanced popover + export ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Result count */}
        <span className="text-sm font-semibold text-foreground/80 shrink-0 whitespace-nowrap">
          {filtered.length} Campaign{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== campaigns.length && (
            <span className="text-xs font-normal text-muted-foreground"> of {campaigns.length}</span>
          )}
        </span>

        {/* Primary filter selects — always visible */}
        <FilterSelect label="Account"  value={filterAccount}  options={filterOpts.accounts}  onChange={setFilterAccount} />
        <FilterSelect label="Urgency"  value={filterUrgency}  options={filterOpts.urgencies} onChange={setFilterUrgency} />
        <FilterSelect label="Variance" value={filterSchedVariance} options={["Early", "On Time", "Late"]}
          onChange={(v) => setFilterSchedVariance(v === "Early" ? "early" : v === "On Time" ? "on-time" : v === "Late" ? "late" : ALL)} />

        {/* Advanced filters — popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 border-[#cfd4df]${
                (filterDriverClass !== ALL || filterDriverType !== ALL || filterEmpType !== ALL ||
                 filterCampaignType !== ALL || filterCertLiaison !== ALL ||
                 filterStartFrom || filterStartTo || filterClosingFrom || filterClosingTo)
                  ? " border-primary/50 text-primary"
                  : ""
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Advanced Filters</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Driver Class</label>
                  <FilterSelect label="All" value={filterDriverClass} options={filterOpts.driverClasses} onChange={setFilterDriverClass} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Driver Type</label>
                  <FilterSelect label="All" value={filterDriverType} options={filterOpts.driverTypes} onChange={setFilterDriverType} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Employment</label>
                  <FilterSelect label="All" value={filterEmpType} options={filterOpts.empTypes} onChange={setFilterEmpType} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Campaign Type</label>
                  <FilterSelect label="All" value={filterCampaignType} options={filterOpts.campaignTypes} onChange={setFilterCampaignType} />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cert Liaison</label>
                  <FilterSelect label="All" value={filterCertLiaison} options={filterOpts.certLiaisons} onChange={setFilterCertLiaison} />
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Start Date Range</p>
                <div className="flex items-center gap-1">
                  <Input type="date" value={filterStartFrom} onChange={(e) => setFilterStartFrom(e.target.value)}
                    className="h-7 text-xs flex-1" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" value={filterStartTo} onChange={(e) => setFilterStartTo(e.target.value)}
                    className="h-7 text-xs flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Closing Date Range</p>
                <div className="flex items-center gap-1">
                  <Input type="date" value={filterClosingFrom} onChange={(e) => setFilterClosingFrom(e.target.value)}
                    className="h-7 text-xs flex-1" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" value={filterClosingTo} onChange={(e) => setFilterClosingTo(e.target.value)}
                    className="h-7 text-xs flex-1" />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear — only when filters are active */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground shrink-0" onClick={clearFilters}>
            <FilterX className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-[#cfd4df] shrink-0" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* ── Active filter chips — Claims pattern, only shown when active ──── */}
      {filterChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/30"
          data-testid="filter-indicator-bar"
        >
          <span className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap shrink-0">
            Active Filters:
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {filterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[#eeebff] text-[#4a2bd3] border-[#d4ccff] dark:bg-primary/10 dark:text-primary dark:border-primary/30"
              >
                {chip.label}
              </span>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="ml-auto shrink-0 h-7 px-2.5 text-xs border-[#d7dbe4] dark:border-border text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* ── KPI grid — Claims Dashboard KpiCard style, full-width ─────────── */}
      <KpiGrid items={[
        { label: "Closed Campaigns",  value: summary.total },
        { label: "Target Drivers",    value: summary.totalTarget },
        { label: "Drivers Hired",     value: summary.totalHired },
        { label: "Fill Rate",         value: `${summary.fillRate}%`, sub: `${summary.totalHired} of ${summary.totalTarget}` },
        {
          label: "On-Time Completion",
          value: summary.onTimeRate != null ? `${summary.onTimeRate}%` : "—",
          sub:   summary.onTimeRate != null ? "of campaigns with target date" : "No target dates set",
        },
      ]} />

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {campaigns.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground" data-testid="empty-closed-campaigns">
          No closed campaigns yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground" data-testid="empty-filtered-campaigns">
          No campaigns match the current filters.
        </p>
      ) : (
        <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead className="bg-[#f7f8fb] dark:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
              <tr>
                {/* 1 — Account (frozen left) */}
                <Th sticky sortKey="account" sort={sort} onSort={handleSort}>Account</Th>
                {/* 2 — Urgency */}
                <Th sortKey="urgency" sort={sort} onSort={handleSort}>Urgency</Th>
                {/* 3 — Open Days */}
                <Th center sortKey="openDays" sort={sort} onSort={handleSort}>Open Days</Th>
                {/* 4 — Target Drivers */}
                <Th center sortKey="targetDrivers" sort={sort} onSort={handleSort} wrap>Target Drivers</Th>
                {/* 5 — Hired Drivers */}
                <Th center sortKey="hiredDrivers" sort={sort} onSort={handleSort} wrap>Hired Drivers</Th>
                {/* 6 — WIW Hours */}
                <Th center sortKey="wiwHours" sort={sort} onSort={handleSort} wrap>WIW Hours (30d)</Th>
                {/* 7 — Start Date */}
                <Th center sortKey="startDate" sort={sort} onSort={handleSort}>Start Date</Th>
                {/* 8 — Target Completion */}
                <Th center sortKey="targetCompletion" sort={sort} onSort={handleSort} wrap>Target Completion</Th>
                {/* 9 — Actual Closing Date */}
                <Th center sortKey="closingDate" sort={sort} onSort={handleSort} wrap>Actual Closing Date</Th>
                {/* 10 — Schedule Variance */}
                <Th center sortKey="scheduleVariance" sort={sort} onSort={handleSort} wrap>Schedule Variance</Th>
                {/* 11 — Cert Liaison */}
                <Th center sortKey="certLiaison" sort={sort} onSort={handleSort} wrap>Cert Liaison</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef3] dark:divide-border">
              {sorted.map((c) => {
                const varInfo = schedVarianceLabel(c.scheduleVariance);
                const wiw     = wiwDisplay(c.wiwHoursLast30, c.hiredDriversCount);
                const fillPct = c.targetDriverCount > 0
                  ? Math.round((c.hiredDriversCount / c.targetDriverCount) * 100) + "%"
                  : "—";
                const urgCfg  = c.urgency != null ? (URGENCY_CONFIG[c.urgency] ?? null) : null;
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10 transition-colors"
                    onClick={() => setLocation(`/recruiting/campaigns/${c.id}`)}
                  >
                    {/* 1 — Account */}
                    <Td className="font-medium max-w-[220px] sticky left-0 z-10 bg-inherit border-r border-border/60">
                      <span className="truncate block text-[13px]" title={c.dealershipName ?? "—"}>
                        {c.dealershipName ?? <span className="text-muted-foreground font-normal">—</span>}
                      </span>
                      {c.location && (
                        <span className="text-[11px] text-muted-foreground block leading-tight">{c.location}</span>
                      )}
                    </Td>
                    {/* 2 — Urgency: semantic text, no colored pill */}
                    <Td>
                      {urgCfg
                        ? <span className={`text-[13px] ${urgCfg.cls}`}>{urgCfg.label}</span>
                        : <span className="text-muted-foreground text-[13px]">—</span>
                      }
                    </Td>
                    {/* 3 — Open Days */}
                    <Td className="text-center tabular-nums">
                      {c.openDays != null
                        ? c.openDays
                        : <span className="text-muted-foreground">—</span>
                      }
                    </Td>
                    {/* 4 — Target Drivers */}
                    <Td className="text-center tabular-nums">{c.targetDriverCount}</Td>
                    {/* 5 — Hired Drivers (clickable, with fill rate sub) */}
                    <Td className="text-center">
                      <button
                        className="tabular-nums font-semibold text-primary hover:underline text-[13px] leading-none"
                        onClick={(e) => { e.stopPropagation(); setDriversCampaign(c); }}
                      >
                        {c.hiredDriversCount}
                      </button>
                      <span className="block text-[10px] text-muted-foreground leading-none mt-0.5">{fillPct}</span>
                    </Td>
                    {/* 6 — WIW Hours */}
                    <Td className="text-center tabular-nums">
                      <span className={wiw.cls}>{wiw.text}</span>
                    </Td>
                    {/* 7 — Start Date */}
                    <Td className="text-center text-muted-foreground whitespace-nowrap">{safeDate(c.startDate)}</Td>
                    {/* 8 — Target Completion */}
                    <Td className="text-center text-muted-foreground whitespace-nowrap">{safeDate(c.endDate)}</Td>
                    {/* 9 — Actual Closing Date (DH-002168) */}
                    <Td className="text-center whitespace-nowrap">
                      {c.actualClosingDate ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-muted-foreground">{safeDate(c.actualClosingDate)}</span>
                          <button
                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditDateCampaign(c); }}
                            title="Edit closing date"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          {/* No closing date: plain text indicator, no colored pill */}
                          <span className="text-[13px] text-amber-600">No date</span>
                          <button
                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditDateCampaign(c); }}
                            title="Set closing date"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </Td>
                    {/* 10 — Schedule Variance */}
                    <Td className="text-center whitespace-nowrap">
                      <span className={`text-[13px] ${varInfo.cls}`}>{varInfo.text}</span>
                    </Td>
                    {/* 11 — Cert Liaison */}
                    <Td className="text-center">
                      {c.certLiaison
                        ? <span className="text-[13px]">{c.certLiaison}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hired Drivers dialog */}
      <HiredDriversDialog
        campaign={driversCampaign}
        open={!!driversCampaign}
        onClose={() => setDriversCampaign(null)}
      />
      {/* DH-002168 — Edit Closing Date dialog */}
      <EditClosingDateDialog
        campaign={editDateCampaign}
        open={!!editDateCampaign}
        onClose={() => setEditDateCampaign(null)}
      />
    </div>
  );
}

export default ClosedCampaignsList;
