import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  Truck, Plus, X, FileSpreadsheet, ChevronDown, ChevronUp,
  Search, RotateCcw, CheckCircle2, AlertTriangle, Activity,
  Calendar, TrendingUp, ChevronLeft, ChevronRight, ArrowUp,
  ArrowDown, ArrowUpDown, Download, SlidersHorizontal,
  BookmarkPlus, Trash2, Pencil, Star, StarOff, Users, Clock,
  Mail, History, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/dateFormat";
import { Trip } from "@shared/schema";
import { ReportIncidentDialog } from "@/components/ReportIncidentDialog";
import { exportToExcel } from "@/lib/excelExport";
import { MOVE_COLUMNS, DEFAULT_VISIBLE_KEYS } from "@/lib/moveColumns";
import { useToast } from "@/hooks/use-toast";
// ── Types ──────────────────────────────────────────────────────────────────

interface TripRow extends Trip {
  driverName?: string | null;
  customerName?: string | null;
  driverReturnCount?: number;
  activeExceptionTypes?: string[] | null;
}

interface PagedResult {
  trips: TripRow[];
  total: number;
}

interface TripStats {
  totalToday: number;
  completedToday: number;
  activeNow: number;
  exceptions: number;
  thisWeek: number;
}

interface MoveSavedView {
  id: string;
  userId: string;
  name: string;
  isSystemDefault: boolean;
  /** When true this view auto-applies on fresh load (no URL filters). Only one per user. */
  isUserDefault: boolean;
  filterMoveNumber?: string | null;
  filterDriver?: string | null;
  filterCustomer?: string | null;
  filterStatus?: string | null;
  filterMoveType?: string | null;
  filterSourceSystem?: string | null;
  filterStartDate?: string | null;
  filterEndDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MoveTeamPreset {
  id: string;
  ownerUserId: string;
  ownerName?: string | null;
  name: string;
  description?: string | null;
  visibility: string;
  filterMoveNumber?: string | null;
  filterDriver?: string | null;
  filterCustomer?: string | null;
  filterStatus?: string | null;
  filterMoveType?: string | null;
  filterSourceSystem?: string | null;
  filterStartDate?: string | null;
  filterEndDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MoveExportSchedule {
  id: string;
  userId: string;
  name: string;
  recipients: string;
  cronExpression: string;
  cronLabel?: string | null;
  timezone: string;
  enabled: boolean;
  filterMoveNumber?: string | null;
  filterDriver?: string | null;
  filterCustomer?: string | null;
  filterStatus?: string | null;
  filterMoveType?: string | null;
  filterSourceSystem?: string | null;
  dateWindow: string;
  filterStartDate?: string | null;
  filterEndDate?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MoveExportRunLogEntry {
  id: string;
  scheduleId: string;
  ranAt: string;
  status: string;
  rowCount?: number | null;
  truncated?: boolean | null;
  recipients?: string | null;
  errorMessage?: string | null;
}

interface Filters {
  moveNumber: string;
  driver: string;
  /** Exact driver-ID filter (URL/deep-link only — no UI control). */
  driverId: string;
  customer: string;
  status: string;
  moveType: string;
  sourceSystem: string;
  startDate: string;
  endDate: string;
  importBatchId: string;
  exceptions: boolean;
  hasDriverReturns: boolean;
  importedToday: boolean;
  /** Only relevant in the Exceptions view. "" = All, "1"/"2"/"3"/"4+" = exact or minimum count. */
  exceptionCountFilter: string;
  /** Only relevant in the Exceptions view. "" = All reasons, or a specific exception type key. */
  exceptionReasonFilter: string;
}

// ── Exception label map ────────────────────────────────────────────────────
const EXCEPTION_LABELS: Record<string, string> = {
  ELIGIBILITY_FAIL:  "Eligibility check failed",
  MISSING_DRIVER:    "No driver linked",
  MISSING_ACCOUNT:   "No account linked",
  CANCELLED:         "Move was cancelled",
  MISSING_MOVE_TYPE: "Move type not set",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getFirstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtCurrency(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

function fmtMiles(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? "—" : `${n.toFixed(1)} mi`;
}

// ── URL ↔ filter state helpers ────────────────────────────────────────────

const VALID_SORT_FIELDS: SortField[] = [
  "tripDate", "moveNumber", "customerName", "driverName", "status", "moveType", "exceptionCount",
];

/** Returns true when the URL has NO meaningful filter or view params.
 *  Used to decide whether to auto-apply the user's default saved view. */
function urlHasExplicitFilters(p: URLSearchParams): boolean {
  const filterKeys = [
    "moveNumber", "driver", "driverId", "customer", "status", "moveType",
    "sourceSystem", "startDate", "endDate", "importBatchId",
    "exceptions", "hasDriverReturns", "importedToday",
    "exceptionCountFilter", "exceptionReasonFilter", "viewName",
  ];
  return filterKeys.some((k) => p.has(k));
}

/** Parse every filter + pagination + sort param from the page URL on mount.
 *
 *  Date-default logic:
 *  When no startDate/endDate are present in the URL AND no view context is active,
 *  default to the current week (Monday → today).  This gives a sensible initial view
 *  on a fresh /trips load.
 *
 *  However, when a system view that intentionally operates without a date window is
 *  active (Exceptions, DriverReturns, Imported Today, or any named saved view),
 *  dates may be deliberately absent from the URL.  In those cases we must NOT inject
 *  Monday/today defaults — doing so silently adds a date filter that overrides the
 *  view (e.g. Exceptions would become "Exceptions within this week only"), and also
 *  breaks back-navigation because the restored state differs from the state that was
 *  URL-serialised before navigating away.
 */
function parseFiltersFromUrl(p: URLSearchParams): Filters {
  // A "view context" is any situation where dates being absent from the URL is
  // intentional rather than "this is a fresh load".
  const hasViewContext =
    p.get("exceptions")       === "true" ||
    p.get("hasDriverReturns") === "true" ||
    p.get("importedToday")    === "true" ||
    p.has("viewName");

  return {
    moveNumber:           p.get("moveNumber")           ?? "",
    driver:               p.get("driver")               ?? "",
    driverId:             p.get("driverId")             ?? "",
    customer:             p.get("customer")             ?? "",
    status:               p.get("status")               ?? "",
    moveType:             p.get("moveType")             ?? "",
    sourceSystem:         p.get("sourceSystem")         ?? "",
    startDate:            p.get("startDate")            ?? (hasViewContext ? "" : getMonday()),
    endDate:              p.get("endDate")              ?? (hasViewContext ? "" : getTodayStr()),
    importBatchId:        p.get("importBatchId")        ?? "",
    exceptions:           p.get("exceptions")           === "true",
    hasDriverReturns:     p.get("hasDriverReturns")     === "true",
    importedToday:        p.get("importedToday")        === "true",
    exceptionCountFilter:  p.get("exceptionCountFilter")  ?? "",
    exceptionReasonFilter: p.get("exceptionReasonFilter") ?? "",
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const MOVE_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "DriverShift", label: "DriverShift" },
  { value: "DriverDash", label: "DriverDash" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "redcap", label: "RedCap" },
  { value: "uber", label: "Uber" },
  { value: "manual", label: "Manual" },
];

const DEFAULT_FILTERS: Filters = {
  moveNumber: "",
  driver: "",
  driverId: "",
  customer: "",
  status: "",
  moveType: "",
  sourceSystem: "",
  startDate: getMonday(),
  endDate: getTodayStr(),
  importBatchId: "",
  exceptions: false,
  hasDriverReturns: false,
  importedToday: false,
  exceptionCountFilter: "",
  exceptionReasonFilter: "",
};

/** Convert a MoveSavedView's filter columns into Filters */
function viewToFilters(view: MoveSavedView): Filters {
  return {
    moveNumber:            view.filterMoveNumber   ?? "",
    driver:                view.filterDriver        ?? "",
    driverId:              "",
    customer:              view.filterCustomer      ?? "",
    status:                view.filterStatus        ?? "",
    moveType:              view.filterMoveType      ?? "",
    sourceSystem:          view.filterSourceSystem  ?? "",
    startDate:             view.filterStartDate     ?? "",
    endDate:               view.filterEndDate       ?? "",
    importBatchId:         "",
    exceptions:            false,
    hasDriverReturns:      false,
    importedToday:         false,
    exceptionCountFilter:  "",
    exceptionReasonFilter: "",
  };
}

/** Columns written to the Excel export — always full set regardless of chooser visibility. */
const EXPORT_COLUMNS = [
  { header: "Move #",           key: "moveNumber" },
  { header: "Date",             key: "tripDate" },
  { header: "Account",          key: "customerName" },
  { header: "Driver",           key: "driverName" },
  { header: "Type",             key: "moveType" },
  { header: "Status",           key: "status" },
  { header: "Origin",           key: "origin" },
  { header: "Destination",      key: "destination" },
  { header: "Miles",            key: "distance" },
  { header: "Source",           key: "sourceSystem" },
  { header: "DR Count",         key: "driverReturnCount" },
  { header: "Charges ($)",      key: "customerCharges" },
  { header: "Driver Pay ($)",   key: "driverPay" },
  { header: "Gross Profit ($)", key: "grossProfit" },
  { header: "Margin (%)",       key: "grossMargin" },
  { header: "Import Batch",     key: "importBatchId" },
];

// ── Sort header component ──────────────────────────────────────────────────

type SortField = "tripDate" | "moveNumber" | "customerName" | "driverName" | "status" | "moveType" | "exceptionCount";

function SortHead({
  label, field, current, dir, onSort,
}: {
  label: string; field: SortField;
  current: SortField; dir: "asc" | "desc";
  onSort: (f: SortField) => void;
}) {
  const active = field === current;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
      </span>
    </TableHead>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function statusBadge(status: string | null | undefined) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scheduled: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ── Cell renderer ──────────────────────────────────────────────────────────

function renderCell(trip: TripRow, key: string): React.ReactNode {
  switch (key) {
    case "moveNumber": {
      return (
        <span className="text-xs font-medium whitespace-nowrap tabular-nums">
          {trip.moveNumber || <span className="text-muted-foreground">—</span>}
        </span>
      );
    }
    case "tripDate":
      return <span className="text-xs whitespace-nowrap">{formatDate(trip.tripDate) || "—"}</span>;
    case "customerName":
      return (
        <span className="text-xs max-w-[160px] truncate block">
          {trip.customerName || <span className="text-muted-foreground">—</span>}
        </span>
      );
    case "driverName":
      return (
        <span className="text-xs max-w-[140px] truncate block">
          {trip.driverName || <span className="text-muted-foreground">—</span>}
        </span>
      );
    case "moveType":
      return trip.moveType
        ? <Badge variant="outline" className="text-xs whitespace-nowrap">{trip.moveType}</Badge>
        : <span className="text-muted-foreground text-xs">—</span>;
    case "status":
      return statusBadge(trip.status);
    case "route":
      return (
        <span className="text-xs text-muted-foreground max-w-[180px] truncate block">
          {trip.origin && trip.destination
            ? `${trip.origin} → ${trip.destination}`
            : trip.origin || trip.destination || "—"}
        </span>
      );
    case "distance":
      return <span className="text-xs tabular-nums">{fmtMiles(trip.distance)}</span>;
    case "drCount":
      return trip.driverReturnCount && trip.driverReturnCount > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-xs tabular-nums cursor-default">
              {trip.driverReturnCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {trip.driverReturnCount} DriverReturn record{trip.driverReturnCount !== 1 ? "s" : ""}
          </TooltipContent>
        </Tooltip>
      ) : <span className="text-muted-foreground/30 text-xs">—</span>;
    case "evidence":
      return (
        <div className="flex gap-1 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
                trip.pickupPhotoComplianceStatus === "complete"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : trip.pickupPhotoComplianceStatus === "partial"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-muted text-muted-foreground border-muted-foreground/20"
              }`}>P</span>
            </TooltipTrigger>
            <TooltipContent>Pickup: {trip.pickupPhotoComplianceStatus || "not started"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
                trip.dropoffPhotoComplianceStatus === "complete"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : trip.dropoffPhotoComplianceStatus === "partial"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-muted text-muted-foreground border-muted-foreground/20"
              }`}>D</span>
            </TooltipTrigger>
            <TooltipContent>Dropoff: {trip.dropoffPhotoComplianceStatus || "not started"}</TooltipContent>
          </Tooltip>
        </div>
      );
    case "sourceSystem":
      return trip.sourceSystem
        ? <Badge variant="outline" className="text-xs">{trip.sourceSystem}</Badge>
        : <span className="text-muted-foreground text-xs">—</span>;
    case "importBatchId":
      return trip.importBatchId
        ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs text-muted-foreground cursor-default">
                {trip.importBatchId.slice(0, 8)}…
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-xs">{trip.importBatchId}</TooltipContent>
          </Tooltip>
        )
        : <span className="text-muted-foreground text-xs">—</span>;
    case "customerCharges":
      return <span className="text-xs tabular-nums">{fmtCurrency(trip.customerCharges)}</span>;
    case "driverPay":
      return <span className="text-xs tabular-nums">{fmtCurrency(trip.driverPay)}</span>;
    case "grossProfit":
      return <span className="text-xs tabular-nums">{fmtCurrency(trip.grossProfit)}</span>;
    case "grossMargin":
      if (!trip.grossMargin) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="text-xs tabular-nums">
          {parseFloat(String(trip.grossMargin)).toFixed(1)}%
        </span>
      );
    default:
      return <span className="text-muted-foreground text-xs">—</span>;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Trips() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  // Parse URL once; used only at mount-time to initialise state.
  // The back-button restores the full URL, so re-mounting re-reads all context.
  const urlParams = new URLSearchParams(searchString);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Filter state — seeded from URL so the browser back-button restores
  //    context after navigating into a Move Detail and returning ────────────
  const [applied, setApplied] = useState<Filters>(() => parseFiltersFromUrl(urlParams));
  const [pending, setPending] = useState<Filters>(() => parseFiltersFromUrl(urlParams));
  const [showMore, setShowMore] = useState(false);

  // ── Pagination & sort — also seeded from URL ───────────────────────────
  const [page, setPage] = useState<number>(() =>
    Math.max(1, parseInt(urlParams.get("page") ?? "1") || 1)
  );
  const [limit, setLimit] = useState<number>(() => {
    const l = parseInt(urlParams.get("limit") ?? "50");
    return [25, 50, 100].includes(l) ? l : 50;
  });
  // Pre-compute whether the sort needs to be overridden to exceptionCount on load.
  // This must happen BEFORE the useState calls so both sortBy and sortDir use the
  // same decision — they cannot be coordinated once inside separate useState lazily.
  //
  // Override when:
  //   1. The URL indicates the Exceptions view is active (viewName=Exceptions or
  //      exceptions=true), AND
  //   2. The sortBy in the URL is absent, empty, or "tripDate" — i.e. the generic
  //      default that was carried over before the Exceptions view was selected.
  //
  // We do NOT override when the user has explicitly chosen a non-default sort column
  // (e.g. driverName, status) while already inside the Exceptions view, because those
  // are intentional choices that should survive a page refresh.
  const _urlSortBy       = urlParams.get("sortBy") ?? "";
  const _inExceptionsView =
    urlParams.get("viewName") === "Exceptions" ||
    urlParams.get("exceptions") === "true";
  const _overrideToExcCount =
    _inExceptionsView &&
    (_urlSortBy === "" || _urlSortBy === "tripDate" || !VALID_SORT_FIELDS.includes(_urlSortBy as SortField));

  const [sortBy, setSortBy] = useState<SortField>(() => {
    if (_overrideToExcCount) return "exceptionCount";
    if (VALID_SORT_FIELDS.includes(_urlSortBy as SortField)) return _urlSortBy as SortField;
    return "tripDate";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    // When we're overriding the sort column to exceptionCount, also lock the
    // direction to desc so the highest-exception-count moves appear first.
    if (_overrideToExcCount) return "desc";
    return urlParams.get("sortDir") === "asc" ? "asc" : "desc";
  });

  // ── Views ──────────────────────────────────────────────────────────────
  const [activeViewName, setActiveViewName] = useState<string | null>(() => {
    const vn = urlParams.get("viewName");
    if (vn) return vn;
    // When the URL carries exceptions=true but no viewName (e.g. old cached URL or
    // direct navigation before the viewName was written), treat it as the Exceptions view
    // so the column and sort are applied correctly on first render.
    if (urlParams.get("exceptions") === "true") return "Exceptions";
    return null;
  });
  /** Whether the page was opened with NO explicit URL filter params (fresh load). */
  const isFreshLoad = useRef(!urlHasExplicitFilters(urlParams));
  /** Track if we've already applied the user default view for this session. */
  const defaultViewApplied = useRef(false);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [renameDialogView, setRenameDialogView] = useState<MoveSavedView | null>(null);

  // ── Team preset dialog state ───────────────────────────────────────────
  const [teamPresetDialogOpen, setTeamPresetDialogOpen] = useState(false);
  const [editingTeamPreset, setEditingTeamPreset] = useState<MoveTeamPreset | null>(null);

  // ── Export schedule dialog state ───────────────────────────────────────
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [runLogDialogSchedule, setRunLogDialogSchedule] = useState<MoveExportSchedule | null>(null);

  // ── Column chooser ─────────────────────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_KEYS);
  const [pendingColumns, setPendingColumns] = useState<string[]>(DEFAULT_VISIBLE_KEYS);
  const [showColumnChooser, setShowColumnChooser] = useState(false);

  // ── Bulk selection ─────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // ── Export ─────────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false);

  // ── System views (computed each render; stable because dates don't change mid-session) ──
  const today    = getTodayStr();
  const monday   = getMonday();
  const firstOfMonth = getFirstOfMonth();

  const systemViews = useMemo(() => [
    { name: "Today's Moves",   filters: { startDate: today, endDate: today } },
    { name: "Active Moves",    filters: { status: "in-progress", startDate: "", endDate: "" } },
    { name: "Completed Today", filters: { status: "completed", startDate: today, endDate: today } },
    { name: "Exceptions",      filters: { exceptions: true, startDate: "", endDate: "" } },
    { name: "DriverReturns",   filters: { hasDriverReturns: true, startDate: "", endDate: "" } },
    { name: "Imported Today",  filters: { importedToday: true, startDate: "", endDate: "" } },
    { name: "This Week",       filters: { startDate: monday, endDate: today } },
    { name: "This Month",      filters: { startDate: firstOfMonth, endDate: today } },
  ], [today, monday, firstOfMonth]);

  // ── Build query-string helper ──────────────────────────────────────────
  const buildParams = useCallback(
    (f: Filters, pg: number, lim: number, sb: string, sd: string) => {
      const p = new URLSearchParams();
      if (f.moveNumber)       p.set("moveNumber", f.moveNumber);
      if (f.driver)           p.set("driver", f.driver);
      if (f.driverId)         p.set("driverId", f.driverId);
      if (f.customer)         p.set("customer", f.customer);
      if (f.status)           p.set("status", f.status);
      if (f.moveType)         p.set("moveType", f.moveType);
      if (f.sourceSystem)     p.set("sourceSystem", f.sourceSystem);
      if (f.startDate)        p.set("startDate", f.startDate);
      if (f.endDate)          p.set("endDate", f.endDate);
      if (f.importBatchId)    p.set("importBatchId", f.importBatchId);
      if (f.exceptions)            p.set("exceptions", "true");
      if (f.hasDriverReturns)      p.set("hasDriverReturns", "true");
      if (f.importedToday)         p.set("importedToday", "true");
      if (f.exceptionCountFilter)  p.set("exceptionCountFilter",  f.exceptionCountFilter);
      if (f.exceptionReasonFilter) p.set("exceptionReasonFilter", f.exceptionReasonFilter);
      p.set("page", String(pg));
      p.set("limit", String(lim));
      p.set("sortBy", sb);
      p.set("sortDir", sd);
      return p.toString();
    },
    []
  );

  // ── Sync workspace state → URL (replace so no extra history entries) ──
  //    This is what allows window.history.back() to restore full context,
  //    including the active view name badge.
  useEffect(() => {
    const qs = buildParams(applied, page, limit, sortBy, sortDir);
    const full = activeViewName
      ? `${qs}&viewName=${encodeURIComponent(activeViewName)}`
      : qs;
    setLocation(`/trips?${full}`, { replace: true });
    // buildParams and setLocation are stable refs — intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page, limit, sortBy, sortDir, activeViewName]);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: result, isLoading } = useQuery<PagedResult>({
    queryKey: ["/api/corporate/trips", applied, page, limit, sortBy, sortDir],
    queryFn: async () => {
      const qs = buildParams(applied, page, limit, sortBy, sortDir);
      const res = await fetch(`/api/corporate/trips?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trips");
      return res.json();
    },
  });

  // Exception facets — which reasons and count buckets are non-zero right now.
  // Drives the dynamic filter dropdowns so zero-result options are never shown.
  const { data: exceptionFacets } = useQuery<{
    reasons: { type: string; count: number }[];
    countBuckets: { bucket: string; count: number }[];
  }>({
    queryKey: ["/api/corporate/trips/exception-facets"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/trips/exception-facets", { credentials: "include" });
      if (!res.ok) return { reasons: [], countBuckets: [] };
      return res.json();
    },
    enabled: applied.exceptions,
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<TripStats>({
    queryKey: ["/api/corporate/trips/stats"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/trips/stats", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: savedViews = [] } = useQuery<MoveSavedView[]>({
    queryKey: ["/api/corporate/move-views"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/move-views", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  // ── Team presets query (Task #87) ──────────────────────────────────────
  const { data: teamPresets = [] } = useQuery<MoveTeamPreset[]>({
    queryKey: ["/api/corporate/move-team-presets"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/move-team-presets", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  // ── Export schedules query (Task #85) ─────────────────────────────────
  const { data: exportSchedules = [] } = useQuery<MoveExportSchedule[]>({
    queryKey: ["/api/corporate/move-export-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/move-export-schedules", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  // Load column preferences from layout API on mount
  useQuery({
    queryKey: ["/api/layout/moves-list"],
    queryFn: async () => {
      const res = await fetch("/api/layout/moves-list", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      const cols = data?.placement?.columns as string[] | undefined;
      if (Array.isArray(cols) && cols.length > 0) {
        setVisibleColumns(cols);
        setPendingColumns(cols);
      }
      return data;
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const saveViewMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof filtersToViewPayload>) => {
      const res = await fetch("/api/corporate/move-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save view");
      return res.json() as Promise<MoveSavedView>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-views"] });
      setActiveViewName(created.name);
      setSaveDialogOpen(false);
      toast({ title: "View saved", description: `"${created.name}" is now in your saved views` });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const renameViewMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/corporate/move-views/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename view");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-views"] });
      setRenameDialogView(null);
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/move-views/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-views"] });
      const deleted = savedViews.find((v) => v.id === id);
      if (deleted && activeViewName === deleted.name) setActiveViewName(null);
      toast({ title: "View deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const saveColumnsMutation = useMutation({
    mutationFn: async (cols: string[]) => {
      const res = await fetch("/api/layout/moves-list", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ placement: { columns: cols } }),
      });
      if (!res.ok) throw new Error("Failed to save columns");
      return res.json();
    },
    onError: () => toast({ title: "Could not save column preferences", variant: "destructive" }),
  });

  // ── Task #86: Set/unset user default view ─────────────────────────────
  const setDefaultViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      const res = await fetch(`/api/corporate/move-views/${viewId}/set-default`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to set default view");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-views"] });
      toast({ title: "Default view set", description: "This view will auto-apply on fresh loads." });
    },
    onError: () => toast({ title: "Failed to set default view", variant: "destructive" }),
  });

  const unsetDefaultViewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/corporate/move-views/default/unset", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to unset default view");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-views"] });
      toast({ title: "Default view removed" });
    },
    onError: () => toast({ title: "Failed to remove default view", variant: "destructive" }),
  });

  // ── Task #87: Team preset mutations ───────────────────────────────────
  const createTeamPresetMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/corporate/move-team-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create team preset");
      return res.json() as Promise<MoveTeamPreset>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-team-presets"] });
      setTeamPresetDialogOpen(false);
      setEditingTeamPreset(null);
      toast({ title: "Team preset created", description: "Visible to all dispatch team members." });
    },
    onError: () => toast({ title: "Failed to create team preset", variant: "destructive" }),
  });

  const updateTeamPresetMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/corporate/move-team-presets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update team preset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-team-presets"] });
      setTeamPresetDialogOpen(false);
      setEditingTeamPreset(null);
      toast({ title: "Team preset updated" });
    },
    onError: () => toast({ title: "Failed to update team preset", variant: "destructive" }),
  });

  const deleteTeamPresetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/move-team-presets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-team-presets"] });
      toast({ title: "Team preset deleted" });
    },
    onError: () => toast({ title: "Failed to delete team preset", variant: "destructive" }),
  });

  // ── Task #85: Export schedule mutations ───────────────────────────────
  const createScheduleMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/corporate/move-export-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).message ?? "Failed to create schedule");
      }
      return res.json() as Promise<MoveExportSchedule>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-export-schedules"] });
      setScheduleDialogOpen(false);
      toast({ title: "Export schedule created", description: "Emails will be sent on schedule." });
    },
    onError: (e: Error) => toast({ title: "Failed to create schedule", description: e.message, variant: "destructive" }),
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/corporate/move-export-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-export-schedules"] }),
    onError: () => toast({ title: "Failed to update schedule", variant: "destructive" }),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/move-export-schedules/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-export-schedules"] });
      toast({ title: "Schedule deleted" });
    },
    onError: () => toast({ title: "Failed to delete schedule", variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/corporate/move-export-schedules/${id}/run-now`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Run failed");
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/move-export-schedules"] });
      if (result.status === "success") {
        toast({ title: "Export sent", description: `${result.rowCount?.toLocaleString()} rows emailed.` });
      } else {
        toast({ title: "Export issue", description: result.errorMessage ?? result.status, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Run failed", variant: "destructive" }),
  });

  // ── Task #86: Auto-apply user default view on fresh load ──────────────
  useEffect(() => {
    if (!isFreshLoad.current) return;
    if (defaultViewApplied.current) return;
    if (savedViews.length === 0) return; // wait until views are loaded
    const defaultView = savedViews.find((v) => v.isUserDefault);
    if (!defaultView) return;
    defaultViewApplied.current = true;
    // Only apply if the user hasn't interacted yet (still on default date window)
    applyView(defaultView.name, viewToFilters(defaultView));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews]);

  // ── Derived ────────────────────────────────────────────────────────────
  const trips      = result?.trips ?? [];
  const total      = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const activeFilterCount =
    [applied.moveNumber, applied.driver, applied.customer,
     applied.status, applied.moveType, applied.sourceSystem,
     applied.importBatchId].filter(Boolean).length +
    (applied.startDate !== DEFAULT_FILTERS.startDate ||
     applied.endDate   !== DEFAULT_FILTERS.endDate ? 1 : 0) +
    (applied.exceptions       ? 1 : 0) +
    (applied.hasDriverReturns ? 1 : 0) +
    (applied.importedToday    ? 1 : 0);

  // Column defs for the current visible set (always-visible + user-chosen).
  // When the Exceptions System View is active, inject an Exceptions column
  // immediately after Move # so dispatchers see the count and labels per row.
  const visibleColDefs = useMemo(() => {
    const inExceptionsView = activeViewName === "Exceptions" || applied.exceptions;
    let cols = MOVE_COLUMNS.filter(
      (c) => c.alwaysVisible || visibleColumns.includes(c.key)
    );
    // When in Exceptions view, remove columns not relevant to the exceptions workspace.
    // The Incident Report action, DR count, and Evidence columns are not needed here;
    // recovering the horizontal space improves table density on the operational list.
    if (inExceptionsView) {
      cols = cols.filter((c) => c.key !== "__actions" && c.key !== "drCount" && c.key !== "evidence");
    }
    // Inject the Exceptions column whenever the exceptions filter is active — whether
    // the user arrived via the KPI card, System View button, or a raw ?exceptions=true URL.
    if (inExceptionsView) {
      const excCol = { key: "__exceptions", label: "Exceptions", sortField: "exceptionCount", defaultVisible: true };
      const mnIdx = cols.findIndex((c) => c.key === "moveNumber");
      cols.splice(mnIdx >= 0 ? mnIdx + 1 : 1, 0, excCol);
    }
    return cols;
  }, [visibleColumns, activeViewName, applied.exceptions]);

  const allPageSelected = trips.length > 0 && trips.every((t) => selectedRows.has(t.id));
  const somePageSelected = trips.some((t) => selectedRows.has(t.id));

  // KPI widgets
  const widgets = [
    { label: "Today",          value: stats?.totalToday,    icon: Calendar,      color: "text-foreground",    filter: { startDate: today, endDate: today, status: "" } },
    { label: "Active",         value: stats?.activeNow,     icon: Activity,      color: "text-blue-600",      filter: { status: "in-progress", startDate: "", endDate: "" } },
    { label: "Completed Today",value: stats?.completedToday,icon: CheckCircle2,  color: "text-emerald-600",   filter: { startDate: today, endDate: today, status: "completed" } },
    { label: "Exceptions",     value: stats?.exceptions,    icon: AlertTriangle, color: "text-amber-600",     filter: { startDate: "", endDate: "", status: "", exceptions: true }, viewName: "Exceptions" },
    { label: "This Week",      value: stats?.thisWeek,      icon: TrendingUp,    color: "text-primary",       filter: { startDate: monday, endDate: today, status: "" } },
  ];

  // ── Handlers ───────────────────────────────────────────────────────────

  function applyFilters() {
    let next = { ...pending };

    // Move Number is an identifier lookup — it must search the full dataset.
    // Strip any system-view boolean filters that would silently block a valid move.
    if (next.moveNumber.trim()) {
      next.exceptions           = false;
      next.hasDriverReturns     = false;
      next.importedToday        = false;
      next.exceptionCountFilter  = "";
      next.exceptionReasonFilter = "";
      // If dates came from a named system view (Today / This Week / etc.),
      // clear them too so the date window doesn't constrain the lookup.
      // Dates the user typed manually (no active view name) are kept.
      if (activeViewName) {
        next.startDate = "";
        next.endDate   = "";
      }
    }

    setApplied(next);
    setPending(next); // keep form in sync with what's actually being searched
    setPage(1);
    setActiveViewName(null);
    setSelectedRows(new Set());
  }

  /** Clear a single system-view boolean filter without resetting everything. */
  function clearSystemFilter(key: "exceptions" | "hasDriverReturns" | "importedToday") {
    const next: Filters = { ...applied, [key]: false };
    // When clearing the Exceptions view, also reset both exception sub-filters.
    if (key === "exceptions") { next.exceptionCountFilter = ""; next.exceptionReasonFilter = ""; }
    setPending(next);
    setApplied(next);
    setPage(1);
    setActiveViewName(null);
  }

  function resetFilters() {
    const fresh = { ...DEFAULT_FILTERS };
    setPending(fresh);
    setApplied(fresh);
    setPage(1);
    setActiveViewName(null);
    setSelectedRows(new Set());
    // URL is updated by the useEffect that watches [applied, page, …]
  }

  function clearBatchFilter() {
    const next = { ...applied, importBatchId: "" };
    setPending(next);
    setApplied(next);
    setPage(1);
    setActiveViewName(null);
    // URL is updated by the useEffect that watches [applied, page, …]
  }

  function handleSort(field: SortField) {
    if (field === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function applyWidget(overrides: Partial<Filters>) {
    const next = { ...DEFAULT_FILTERS, ...overrides };
    setPending(next);
    setApplied(next);
    setPage(1);
    setActiveViewName(null);
    setSelectedRows(new Set());
  }

  function applyView(name: string, filters: Partial<Filters>) {
    const next = { ...DEFAULT_FILTERS, ...filters } as Filters;
    setPending(next);
    setApplied(next);
    setPage(1);
    setActiveViewName(name);
    setSelectedRows(new Set());
    // Default the Exceptions view to sort by active exception count, highest first,
    // so dispatchers see the most complex cases at the top of the queue.
    if (name === "Exceptions") {
      setSortBy("exceptionCount");
      setSortDir("desc");
    } else {
      // Reset sort to date-desc for all other system views so the transition is clean.
      setSortBy("tripDate");
      setSortDir("desc");
    }
  }

  function handleSaveView(name: string) {
    saveViewMutation.mutate(filtersToViewPayload(applied, name));
  }

  function handleRenameView(name: string) {
    if (!renameDialogView) return;
    renameViewMutation.mutate({ id: renameDialogView.id, name });
  }

  function openColumnChooser() {
    setPendingColumns([...visibleColumns]);
    setShowColumnChooser(true);
  }

  function confirmColumnChooser() {
    setVisibleColumns(pendingColumns);
    setShowColumnChooser(false);
    saveColumnsMutation.mutate(pendingColumns);
  }

  function togglePendingColumn(key: string, checked: boolean) {
    setPendingColumns((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  }

  function toggleRow(id: string, checked: boolean) {
    const next = new Set(selectedRows);
    if (checked) next.add(id); else next.delete(id);
    setSelectedRows(next);
  }

  function toggleAllRows(checked: boolean) {
    if (checked) {
      setSelectedRows(new Set(trips.map((t) => t.id)));
    } else {
      setSelectedRows(new Set());
    }
  }

  async function handleExport() {
    if (exportLoading) return;
    setExportLoading(true);
    try {
      const p = new URLSearchParams();
      if (applied.moveNumber)       p.set("moveNumber", applied.moveNumber);
      if (applied.driver)           p.set("driver", applied.driver);
      if (applied.driverId)         p.set("driverId", applied.driverId);
      if (applied.customer)         p.set("customer", applied.customer);
      if (applied.status)           p.set("status", applied.status);
      if (applied.moveType)         p.set("moveType", applied.moveType);
      if (applied.sourceSystem)     p.set("sourceSystem", applied.sourceSystem);
      if (applied.startDate)        p.set("startDate", applied.startDate);
      if (applied.endDate)          p.set("endDate", applied.endDate);
      if (applied.importBatchId)    p.set("importBatchId", applied.importBatchId);
      if (applied.exceptions)       p.set("exceptions", "true");
      if (applied.hasDriverReturns) p.set("hasDriverReturns", "true");
      if (applied.importedToday)    p.set("importedToday", "true");
      p.set("sortBy", sortBy);
      p.set("sortDir", sortDir);

      const res = await fetch(`/api/corporate/trips/export?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const rows: TripRow[] = data.trips ?? [];

      exportToExcel(rows as any[], EXPORT_COLUMNS, "moves-export");

      if (data.truncated) {
        toast({
          title: "Export truncated",
          description: `Only the first ${(data.cap as number).toLocaleString()} moves were exported. Narrow your filters to get all results.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Export ready", description: `Downloading ${rows.length.toLocaleString()} moves` });
      }
    } catch {
      toast({ title: "Export failed", description: "Could not download the file.", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  }

  function handleExportSelected() {
    const selected = trips.filter((t) => selectedRows.has(t.id));
    if (selected.length === 0) return;
    exportToExcel(selected as any[], EXPORT_COLUMNS, "moves-selected");
    toast({ title: "Export started", description: `Downloading ${selected.length} selected moves` });
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full bg-background" data-ipad-module="moves">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b">
        <div className="flex items-center gap-2.5">
          <Truck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Moves</h1>
          {!isLoading && total > 0 && (
            <span className="text-sm text-muted-foreground">{total.toLocaleString()} records</span>
          )}
          {/* Active view indicator — shown in the Views bar below; no redundant chip here */}
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={handleExport}
                disabled={exportLoading || total === 0}
                data-testid="button-export"
              >
                <Download className={`h-4 w-4 ${exportLoading ? "animate-pulse" : ""}`} />
                <span className="ml-1.5 hidden sm:inline">
                  {exportLoading ? "Exporting…" : "Export"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export filtered results to Excel (max 5,000 rows)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setScheduleDialogOpen(true)}
                data-testid="button-schedule-export"
              >
                <Mail className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Schedule</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Schedule recurring email exports</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={openColumnChooser}
                data-testid="button-columns"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Columns</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Choose visible columns</TooltipContent>
          </Tooltip>
          <Button size="sm" onClick={() => setLocation("/trips/new")} data-testid="button-add-trip">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Move
          </Button>
        </div>
      </div>

      <div className="px-6 pt-3 pb-6 space-y-2">

        {/* ── KPI Widgets ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {widgets.map((w) => (
            <button
              key={w.label}
              onClick={() => (w as any).viewName ? applyView((w as any).viewName, w.filter) : applyWidget(w.filter)}
              className="border rounded-lg p-2 bg-card text-left hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                <w.icon className="h-3 w-3" />
                {w.label}
              </p>
              <p className={`text-xl font-bold tabular-nums leading-none ${w.color}`}>
                {w.value === undefined ? (
                  <span className="block h-5 w-10 bg-muted animate-pulse rounded" />
                ) : (
                  w.value.toLocaleString()
                )}
              </p>
            </button>
          ))}
        </div>

        {/* ── Saved Views Bar ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Views:</span>

          {/* System views */}
          {systemViews.map((v) => {
            const isActive = activeViewName === v.name;
            return (
              <button
                key={v.name}
                onClick={() => applyView(v.name, v.filters)}
                data-testid={`view-btn-${v.name.toLowerCase().replace(/\s+/g, "-")}`}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/40 ring-offset-1"
                    : "bg-muted/50 hover:bg-muted border-muted-foreground/20 text-muted-foreground hover:text-foreground"
                }`}
              >
                {isActive && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                {v.name}
              </button>
            );
          })}

          {/* Divider if user has saved views */}
          {savedViews.filter((v) => !v.isSystemDefault).length > 0 && (
            <span className="text-muted-foreground/30 text-sm select-none">|</span>
          )}

          {/* User saved views */}
          {savedViews.filter((v) => !v.isSystemDefault).map((v) => (
            <span
              key={v.id}
              className={`inline-flex items-center gap-0 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                activeViewName === v.name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted border-border text-foreground"
              }`}
            >
              <button
                onClick={() => applyView(v.name, viewToFilters(v))}
                className="px-2.5 py-1 focus:outline-none"
              >
                {v.isUserDefault && <Star className="h-3 w-3 inline mr-1 text-amber-500" />}
                {v.name}
              </button>
              {/* Set/unset default */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => v.isUserDefault ? unsetDefaultViewMutation.mutate() : setDefaultViewMutation.mutate(v.id)}
                    className="px-1 py-1 opacity-40 hover:opacity-100 transition-opacity focus:outline-none"
                    data-testid={`button-default-view-${v.id}`}
                    title={v.isUserDefault ? "Remove as default" : "Set as default view"}
                  >
                    {v.isUserDefault ? <StarOff className="h-3 w-3 text-amber-500" /> : <Star className="h-3 w-3" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{v.isUserDefault ? "Remove as default" : "Set as my default view"}</TooltipContent>
              </Tooltip>
              <button
                onClick={() => setRenameDialogView(v)}
                className="px-1 py-1 opacity-40 hover:opacity-100 transition-opacity focus:outline-none"
                data-testid={`button-rename-view-${v.id}`}
                title="Rename view"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => deleteViewMutation.mutate(v.id)}
                className="pr-1.5 py-1 opacity-40 hover:opacity-100 transition-opacity focus:outline-none"
                data-testid={`button-delete-view-${v.id}`}
                title="Delete view"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Team presets (Task #87) */}
          {teamPresets.length > 0 && (
            <span className="text-muted-foreground/30 text-sm select-none">|</span>
          )}
          {teamPresets.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-0 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                activeViewName === `team:${p.name}`
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-300"
              }`}
            >
              <button
                onClick={() => applyView(`team:${p.name}`, viewToFilters(p as any))}
                className="pl-2 pr-1 py-1 flex items-center gap-1 focus:outline-none"
              >
                <Users className="h-3 w-3 shrink-0" />
                {p.name}
              </button>
              {/* Owner controls */}
              <button
                onClick={() => { setEditingTeamPreset(p); setTeamPresetDialogOpen(true); }}
                className="px-1 py-1 opacity-40 hover:opacity-100 transition-opacity focus:outline-none"
                title={`Edit (owner: ${p.ownerName ?? "unknown"})`}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => deleteTeamPresetMutation.mutate(p.id)}
                className="pr-1.5 py-1 opacity-40 hover:opacity-100 transition-opacity focus:outline-none"
                title="Delete team preset"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Save current view */}
          <button
            onClick={() => setSaveDialogOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-dashed border-muted-foreground/30 transition-colors whitespace-nowrap"
            data-testid="button-save-view"
          >
            <BookmarkPlus className="h-3 w-3" />
            Save view
          </button>

          {/* Share as team preset */}
          <button
            onClick={() => { setEditingTeamPreset(null); setTeamPresetDialogOpen(true); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-violet-600 hover:text-violet-800 hover:bg-violet-50 border border-dashed border-violet-300 transition-colors whitespace-nowrap dark:text-violet-400 dark:border-violet-700"
            data-testid="button-save-team-preset"
          >
            <Users className="h-3 w-3" />
            Share preset
          </button>
        </div>

        {/* ── Filter Toolbar ─────────────────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {/* Primary filter row */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[110px] max-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Move #</label>
              <Input
                className="h-8 text-sm"
                placeholder="Move number"
                value={pending.moveNumber}
                onChange={(e) => setPending((f) => ({ ...f, moveNumber: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                data-testid="input-move-number"
              />
            </div>

            <div className="flex-1 min-w-[110px] max-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Account</label>
              <Input
                className="h-8 text-sm"
                placeholder="Customer name"
                value={pending.customer}
                onChange={(e) => setPending((f) => ({ ...f, customer: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                data-testid="input-customer"
              />
            </div>

            <div className="flex-1 min-w-[110px] max-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Driver</label>
              <Input
                className="h-8 text-sm"
                placeholder="Driver name"
                value={pending.driver}
                onChange={(e) => setPending((f) => ({ ...f, driver: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                data-testid="input-driver"
              />
            </div>

            <div className="min-w-[120px] max-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pending.status}
                onChange={(e) => setPending((f) => ({ ...f, status: e.target.value }))}
                data-testid="select-status"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="min-w-[120px] max-w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">Move Type</label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pending.moveType}
                onChange={(e) => setPending((f) => ({ ...f, moveType: e.target.value }))}
                data-testid="select-move-type"
              >
                {MOVE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="min-w-[120px] max-w-[140px]">
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <Input
                type="date"
                className="h-8 text-sm"
                value={pending.startDate}
                onChange={(e) => setPending((f) => ({ ...f, startDate: e.target.value }))}
                data-testid="input-start-date"
              />
            </div>

            <div className="min-w-[120px] max-w-[140px]">
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <Input
                type="date"
                className="h-8 text-sm"
                value={pending.endDate}
                onChange={(e) => setPending((f) => ({ ...f, endDate: e.target.value }))}
                data-testid="input-end-date"
              />
            </div>

            <div className="flex items-end gap-1.5 pb-0.5">
              <Button size="sm" variant="outline" className="h-8" onClick={applyFilters} data-testid="button-search">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Search
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={resetFilters} data-testid="button-reset">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowMore((v) => !v)}>
                {showMore ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                More
              </Button>
            </div>
          </div>

          {/* Exception sub-filters — Count and Reason — shown only when Exceptions view is active */}
          {applied.exceptions && (
            <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
              {/* Exception Count — options driven by facets; zero-count buckets omitted */}
              <div className="min-w-[140px] max-w-[180px]">
                <label className="text-xs text-muted-foreground block mb-1">Exception Count</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={pending.exceptionCountFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...applied, exceptionCountFilter: v };
                    setApplied(next);
                    setPending(next);
                    setPage(1);
                  }}
                  data-testid="select-exception-count-filter"
                >
                  <option value="">All counts</option>
                  {(exceptionFacets?.countBuckets ?? [
                    { bucket: "1" }, { bucket: "2" }, { bucket: "3" }, { bucket: "4+" },
                  ]).map(({ bucket }) => (
                    <option key={bucket} value={bucket}>
                      {bucket === "4+" ? "4 or more" : `Exactly ${bucket}`}
                    </option>
                  ))}
                </select>
              </div>
              {/* Exception Reason — options driven by facets; zero-count reasons omitted */}
              <div className="min-w-[160px] max-w-[220px]">
                <label className="text-xs text-muted-foreground block mb-1">Exception Reason</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={pending.exceptionReasonFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...applied, exceptionReasonFilter: v };
                    setApplied(next);
                    setPending(next);
                    setPage(1);
                  }}
                  data-testid="select-exception-reason-filter"
                >
                  <option value="">All reasons</option>
                  {(exceptionFacets?.reasons ?? []).map(({ type }) => (
                    <option key={type} value={type}>{EXCEPTION_LABELS[type] ?? type}</option>
                  ))}
                </select>
              </div>
              {(pending.exceptionCountFilter || pending.exceptionReasonFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const next = { ...applied, exceptionCountFilter: "", exceptionReasonFilter: "" };
                    setApplied(next);
                    setPending(next);
                    setPage(1);
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          )}

          {/* Expanded filters */}
          {showMore && (
            <div className="flex flex-wrap gap-2 items-end pt-1 border-t">
              <div className="min-w-[140px] max-w-[160px]">
                <label className="text-xs text-muted-foreground block mb-1">Source System</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={pending.sourceSystem}
                  onChange={(e) => setPending((f) => ({ ...f, sourceSystem: e.target.value }))}
                  data-testid="select-source-system"
                >
                  {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px] max-w-[280px]">
                <label className="text-xs text-muted-foreground block mb-1">Import Batch ID</label>
                <Input
                  className="h-8 text-sm font-mono"
                  placeholder="Batch UUID"
                  value={pending.importBatchId}
                  onChange={(e) => setPending((f) => ({ ...f, importBatchId: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  data-testid="input-import-batch-id"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Import Batch Banner ───────────────────────────────────────── */}
        {applied.importBatchId && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-900 dark:text-blue-300">
            <FileSpreadsheet className="h-4 w-4 text-blue-500 shrink-0" />
            <span>
              Showing moves from <strong>Import Batch</strong>{" "}
              <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">
                {applied.importBatchId.slice(0, 8)}…
              </span>
            </span>
            <Button
              variant="ghost" size="sm"
              className="h-6 px-2 text-blue-700 hover:text-blue-900 hover:bg-blue-100 ml-auto"
              onClick={clearBatchFilter}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear filter
            </Button>
          </div>
        )}

        {/* ── Bulk Selection Toolbar ────────────────────────────────────── */}
        {selectedRows.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-primary">
              {selectedRows.size} move{selectedRows.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={handleExportSelected}
                data-testid="button-export-selected"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-muted-foreground"
                onClick={() => setSelectedRows(new Set())}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* ── Results Table ──────────────────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden" data-ipad-table="moves">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {visibleColDefs.map((col) => {
                  if (col.key === "__select") {
                    return (
                      <TableHead key="__select" className="w-10">
                        <Checkbox
                          checked={allPageSelected}
                          data-state={somePageSelected && !allPageSelected ? "indeterminate" : undefined}
                          onCheckedChange={(checked) => toggleAllRows(!!checked)}
                          aria-label="Select all on page"
                        />
                      </TableHead>
                    );
                  }
                  if (col.key === "__actions") {
                    return <TableHead key="__actions" className="w-10" />;
                  }
                  if (col.key === "evidence") {
                    return <TableHead key="evidence" className="text-center">Evidence</TableHead>;
                  }
                  if (col.key === "drCount") {
                    return <TableHead key="drCount" className="text-center">DR</TableHead>;
                  }
                  if (col.sortField) {
                    return (
                      <SortHead
                        key={col.key}
                        label={col.label}
                        field={col.sortField as SortField}
                        current={sortBy}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    );
                  }
                  return <TableHead key={col.key}>{col.label}</TableHead>;
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {visibleColDefs.map((col) => (
                      <TableCell key={col.key}>
                        <div className="h-4 bg-muted animate-pulse rounded w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : trips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColDefs.length} className="text-center py-16 text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No moves found</p>
                    <p className="text-sm mt-1">Try adjusting the filters or date range</p>
                  </TableCell>
                </TableRow>
              ) : (
                trips.map((trip) => {
                  const isSelected = selectedRows.has(trip.id);
                  return (
                    <TableRow
                      key={trip.id}
                      className={`cursor-pointer hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`}
                      onClick={() => setLocation(`/trips/${trip.id}`)}
                      data-testid={`row-trip-${trip.id}`}
                    >
                      {visibleColDefs.map((col) => {
                        if (col.key === "__select") {
                          return (
                            <TableCell
                              key="__select"
                              onClick={(e) => e.stopPropagation()}
                              className="pr-0"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => toggleRow(trip.id, !!checked)}
                                aria-label={`Select move ${trip.moveNumber || trip.id}`}
                              />
                            </TableCell>
                          );
                        }
                        if (col.key === "__actions") {
                          return (
                            <TableCell key="__actions" onClick={(e) => e.stopPropagation()}>
                              <ReportIncidentDialog
                                moveId={trip.id}
                                moveNumber={trip.moveNumber || `#${trip.id.slice(0, 8)}`}
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    data-testid={`button-report-incident-${trip.id}`}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                  </Button>
                                }
                              />
                            </TableCell>
                          );
                        }
                        if (col.key === "__exceptions") {
                          const types = (trip as any).activeExceptionTypes as string[] | null ?? [];
                          const count = types.length;
                          if (count === 0) {
                            return <TableCell key="__exceptions" className="text-muted-foreground text-xs text-center">—</TableCell>;
                          }
                          return (
                            <TableCell key="__exceptions" className="text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs font-medium tabular-nums cursor-default">
                                    {count}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                                  <p className="font-medium mb-1">{count} Active Exception{count !== 1 ? "s" : ""}</p>
                                  <ul className="space-y-0.5">
                                    {types.map((t) => <li key={t}>– {EXCEPTION_LABELS[t] ?? t}</li>)}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        }
                        if (col.key === "evidence" || col.key === "drCount") {
                          return (
                            <TableCell
                              key={col.key}
                              className="text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderCell(trip, col.key)}
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={col.key}>
                            {renderCell(trip, col.key)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────────── */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1">
            <span className="text-sm text-muted-foreground">
              {Math.min((page - 1) * limit + 1, total).toLocaleString()}–
              {Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
            </span>

            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7" disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Button>
              <span className="text-sm px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-sm"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        )}

      </div>

      {/* ── Column Chooser Dialog ─────────────────────────────────────────── */}
      <Dialog open={showColumnChooser} onOpenChange={(o) => !o && setShowColumnChooser(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose Visible Columns</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
            {MOVE_COLUMNS.filter((c) => !c.alwaysVisible).map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-3 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={pendingColumns.includes(col.key)}
                  onCheckedChange={(checked) => togglePendingColumn(col.key, !!checked)}
                />
                <span className="text-sm">{col.label}</span>
                {col.defaultVisible ? null : (
                  <span className="ml-auto text-xs text-muted-foreground">optional</span>
                )}
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowColumnChooser(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmColumnChooser} data-testid="button-save-columns">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save View Dialog ──────────────────────────────────────────────── */}
      <SaveViewDialog
        open={saveDialogOpen}
        title="Save Current View"
        onConfirm={handleSaveView}
        onClose={() => setSaveDialogOpen(false)}
        isSaving={saveViewMutation.isPending}
      />

      {/* ── Rename View Dialog ────────────────────────────────────────────── */}
      <SaveViewDialog
        open={!!renameDialogView}
        initialName={renameDialogView?.name ?? ""}
        title="Rename View"
        onConfirm={handleRenameView}
        onClose={() => setRenameDialogView(null)}
        isSaving={renameViewMutation.isPending}
      />

      {/* ── Task #87: Team Preset Dialog ─────────────────────────────────── */}
      <TeamPresetDialog
        open={teamPresetDialogOpen}
        preset={editingTeamPreset}
        currentFilters={applied}
        onClose={() => { setTeamPresetDialogOpen(false); setEditingTeamPreset(null); }}
        onSave={(payload) => {
          if (editingTeamPreset) {
            updateTeamPresetMutation.mutate({ id: editingTeamPreset.id, ...payload });
          } else {
            createTeamPresetMutation.mutate(payload);
          }
        }}
        isSaving={createTeamPresetMutation.isPending || updateTeamPresetMutation.isPending}
      />

      {/* ── Task #85: Export Schedule Manager Dialog ─────────────────────── */}
      <ExportScheduleDialog
        open={scheduleDialogOpen}
        schedules={exportSchedules}
        currentFilters={applied}
        onClose={() => { setScheduleDialogOpen(false); setRunLogDialogSchedule(null); }}
        onCreate={(payload) => createScheduleMutation.mutate(payload)}
        onToggle={(id, enabled) => toggleScheduleMutation.mutate({ id, enabled })}
        onDelete={(id) => deleteScheduleMutation.mutate(id)}
        onRunNow={(id) => runNowMutation.mutate(id)}
        onViewLog={(s) => setRunLogDialogSchedule(s)}
        isCreating={createScheduleMutation.isPending}
      />

      {/* ── Task #85: Run Log Dialog ─────────────────────────────────────── */}
      {runLogDialogSchedule && (
        <RunLogDialog
          schedule={runLogDialogSchedule}
          open={!!runLogDialogSchedule && !scheduleDialogOpen}
          onClose={() => setRunLogDialogSchedule(null)}
        />
      )}

    </div>
  );
}

function SaveViewDialog({ open, initialName = "", title, onConfirm, onClose, isSaving }: SaveViewDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            ref={inputRef}
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
            maxLength={100}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => onConfirm(name.trim())} disabled={!name.trim() || isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SaveViewDialogProps {
  open: boolean;
  initialName?: string;
  title: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

/** Convert current Filters into the payload expected by the API */
function filtersToViewPayload(filters: Filters, name: string) {
  return {
    name,
    filterMoveNumber:   filters.moveNumber   || null,
    filterDriver:       filters.driver        || null,
    filterCustomer:     filters.customer      || null,
    filterStatus:       filters.status        || null,
    filterMoveType:     filters.moveType      || null,
    filterSourceSystem: filters.sourceSystem  || null,
    filterStartDate:    filters.startDate     || null,
    filterEndDate:      filters.endDate       || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #87: Team Preset Dialog
// ─────────────────────────────────────────────────────────────────────────────

interface TeamPresetDialogProps {
  open: boolean;
  preset: MoveTeamPreset | null;
  currentFilters: Filters;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  isSaving: boolean;
}

function TeamPresetDialog({ open, preset, currentFilters, onClose, onSave, isSaving }: TeamPresetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(preset?.name ?? "");
      setDescription(preset?.description ?? "");
    }
  }, [open, preset]);

  const filterSummary = [
    currentFilters.status       && `Status: ${currentFilters.status}`,
    currentFilters.moveType     && `Type: ${currentFilters.moveType}`,
    currentFilters.customer     && `Account: ${currentFilters.customer}`,
    currentFilters.driver       && `Driver: ${currentFilters.driver}`,
    currentFilters.sourceSystem && `Source: ${currentFilters.sourceSystem}`,
    (currentFilters.startDate || currentFilters.endDate) &&
      `Dates: ${currentFilters.startDate || "any"} → ${currentFilters.endDate || "any"}`,
  ].filter(Boolean);

  function handleSave() {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      // When editing, keep existing filters; when creating, capture current filters
      filterMoveNumber:   preset ? preset.filterMoveNumber   : (currentFilters.moveNumber   || null),
      filterDriver:       preset ? preset.filterDriver        : (currentFilters.driver        || null),
      filterCustomer:     preset ? preset.filterCustomer      : (currentFilters.customer      || null),
      filterStatus:       preset ? preset.filterStatus        : (currentFilters.status        || null),
      filterMoveType:     preset ? preset.filterMoveType      : (currentFilters.moveType      || null),
      filterSourceSystem: preset ? preset.filterSourceSystem  : (currentFilters.sourceSystem  || null),
      filterStartDate:    preset ? preset.filterStartDate     : (currentFilters.startDate     || null),
      filterEndDate:      preset ? preset.filterEndDate       : (currentFilters.endDate       || null),
    };
    onSave(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-600" />
            {preset ? "Edit Team Preset" : "Share as Team Preset"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Preset name *</label>
            <Input
              placeholder="e.g. Active DriverShift Moves"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
            <Input
              placeholder="Brief description for teammates"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
          {!preset && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Captured filters:</p>
              {filterSummary.length > 0
                ? filterSummary.map((s, i) => <p key={i}>• {s}</p>)
                : <p className="italic">No filters currently active — all moves will match.</p>}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-3 text-xs text-violet-700 dark:text-violet-300">
            <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>This preset will be visible to <strong>all corporate team members</strong>. Only you can edit or delete it.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isSaving ? "Saving…" : preset ? "Update Preset" : "Share Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #85: Export Schedule Dialog
// ─────────────────────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Daily at 7 AM",        cron: "0 7 * * *",   cronLabel: "Daily at 7:00 AM" },
  { label: "Daily at 8 AM",        cron: "0 8 * * *",   cronLabel: "Daily at 8:00 AM" },
  { label: "Monday at 7 AM",       cron: "0 7 * * 1",   cronLabel: "Every Monday at 7:00 AM" },
  { label: "Monday at 8 AM",       cron: "0 8 * * 1",   cronLabel: "Every Monday at 8:00 AM" },
  { label: "Friday at 5 PM",       cron: "0 17 * * 5",  cronLabel: "Every Friday at 5:00 PM" },
  { label: "1st of month, 8 AM",   cron: "0 8 1 * *",   cronLabel: "1st of each month at 8:00 AM" },
  { label: "Weekdays at 7 AM",     cron: "0 7 * * 1-5", cronLabel: "Weekdays at 7:00 AM" },
];

const DATE_WINDOW_OPTIONS = [
  { value: "today",       label: "Today" },
  { value: "this_week",   label: "This week (Mon–today)" },
  { value: "this_month",  label: "This month" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days",label: "Last 30 days" },
  { value: "custom",      label: "Custom dates (fixed)" },
];

interface ExportScheduleDialogProps {
  open: boolean;
  schedules: MoveExportSchedule[];
  currentFilters: Filters;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRunNow: (id: string) => void;
  onViewLog: (s: MoveExportSchedule) => void;
  isCreating: boolean;
}

function ExportScheduleDialog({
  open, schedules, currentFilters, onClose,
  onCreate, onToggle, onDelete, onRunNow, onViewLog, isCreating,
}: ExportScheduleDialogProps) {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState("");
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[1].cron);
  const [dateWindow, setDateWindow] = useState("this_week");
  const [recipientError, setRecipientError] = useState("");

  useEffect(() => {
    if (open) {
      setTab(schedules.length === 0 ? "create" : "list");
      setName("");
      setRecipients("");
      setCronPreset(CRON_PRESETS[1].cron);
      setDateWindow("this_week");
      setRecipientError("");
    }
  }, [open, schedules.length]);

  function validateRecipients(v: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const addrs = v.split(",").map((s) => s.trim()).filter(Boolean);
    return addrs.length > 0 && addrs.every((a) => re.test(a));
  }

  function handleCreate() {
    if (!validateRecipients(recipients)) {
      setRecipientError("Enter valid comma-separated email addresses.");
      return;
    }
    setRecipientError("");
    const preset = CRON_PRESETS.find((p) => p.cron === cronPreset);
    onCreate({
      name: name.trim(),
      recipients: recipients.split(",").map((s) => s.trim()).filter(Boolean).join(", "),
      cronExpression: cronPreset,
      cronLabel: preset?.cronLabel ?? cronPreset,
      dateWindow,
      filterMoveNumber:   currentFilters.moveNumber   || null,
      filterDriver:       currentFilters.driver        || null,
      filterCustomer:     currentFilters.customer      || null,
      filterStatus:       currentFilters.status        || null,
      filterMoveType:     currentFilters.moveType      || null,
      filterSourceSystem: currentFilters.sourceSystem  || null,
      filterStartDate:    dateWindow === "custom" ? (currentFilters.startDate || null) : null,
      filterEndDate:      dateWindow === "custom" ? (currentFilters.endDate   || null) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Scheduled Email Exports
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b pb-2 mb-3">
          <button
            className={`px-3 py-1 text-sm rounded font-medium transition-colors ${tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("list")}
          >
            <Clock className="h-3.5 w-3.5 inline mr-1.5" />
            My Schedules ({schedules.length})
          </button>
          <button
            className={`px-3 py-1 text-sm rounded font-medium transition-colors ${tab === "create" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("create")}
          >
            <Plus className="h-3.5 w-3.5 inline mr-1.5" />
            New Schedule
          </button>
        </div>

        {tab === "list" && (
          <div className="space-y-3">
            {schedules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No schedules yet.</p>
                <Button size="sm" className="mt-3" onClick={() => setTab("create")}>Create first schedule</Button>
              </div>
            ) : (
              schedules.map((s) => (
                <div key={s.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.cronLabel ?? s.cronExpression} · {DATE_WINDOW_OPTIONS.find((o) => o.value === s.dateWindow)?.label ?? s.dateWindow}</p>
                      <p className="text-xs text-muted-foreground truncate">→ {s.recipients}</p>
                      {s.lastRunAt && (
                        <p className="text-xs text-muted-foreground">Last run: {new Date(s.lastRunAt).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2"
                            onClick={() => onRunNow(s.id)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run now</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2"
                            onClick={() => onViewLog(s)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run history</TooltipContent>
                      </Tooltip>
                      <Button
                        variant={s.enabled ? "outline" : "secondary"}
                        size="sm" className="h-7 px-2 text-xs"
                        onClick={() => onToggle(s.id, !s.enabled)}
                      >
                        {s.enabled ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(s.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Schedule name *</label>
              <Input
                placeholder="e.g. Weekly dispatch summary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Recipients * (comma-separated emails)</label>
              <Input
                placeholder="ops@company.com, dispatch@company.com"
                value={recipients}
                onChange={(e) => { setRecipients(e.target.value); setRecipientError(""); }}
                maxLength={1000}
              />
              {recipientError && <p className="text-xs text-destructive mt-1">{recipientError}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Send schedule</label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                value={cronPreset}
                onChange={(e) => setCronPreset(e.target.value)}
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.cron} value={p.cron}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date window</label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                value={dateWindow}
                onChange={(e) => setDateWindow(e.target.value)}
              >
                {DATE_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Active filters will be captured:</p>
              {[
                currentFilters.status       && `Status: ${currentFilters.status}`,
                currentFilters.moveType     && `Type: ${currentFilters.moveType}`,
                currentFilters.customer     && `Account: ${currentFilters.customer}`,
                currentFilters.driver       && `Driver: ${currentFilters.driver}`,
                currentFilters.sourceSystem && `Source: ${currentFilters.sourceSystem}`,
              ].filter(Boolean).map((s, i) => <p key={i}>• {s}</p>)}
              {![currentFilters.status, currentFilters.moveType, currentFilters.customer, currentFilters.driver, currentFilters.sourceSystem].some(Boolean) && (
                <p className="italic">No filters active — export will include all moves in the date window.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {tab === "create" && (
            <Button onClick={handleCreate} disabled={!name.trim() || !recipients.trim() || isCreating}>
              {isCreating ? "Creating…" : "Create Schedule"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #85: Run Log Dialog
// ─────────────────────────────────────────────────────────────────────────────

interface RunLogDialogProps {
  schedule: MoveExportSchedule;
  open: boolean;
  onClose: () => void;
}

function RunLogDialog({ schedule, open, onClose }: RunLogDialogProps) {
  const { data: log = [], isLoading } = useQuery<MoveExportRunLogEntry[]>({
    queryKey: ["/api/corporate/move-export-schedules", schedule.id, "run-log"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/move-export-schedules/${schedule.id}/run-log`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
    staleTime: 10_000,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Run History — {schedule.name}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : log.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No runs yet.</div>
        ) : (
          <div className="space-y-2">
            {log.map((entry) => (
              <div key={entry.id} className={`border rounded-md p-3 text-sm ${
                entry.status === "success" ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20" :
                entry.status === "failed"  ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                "border-border bg-muted/30"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-medium capitalize ${
                    entry.status === "success" ? "text-emerald-700 dark:text-emerald-400" :
                    entry.status === "failed"  ? "text-red-700 dark:text-red-400" :
                    "text-muted-foreground"
                  }`}>
                    {entry.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(entry.ranAt).toLocaleString()}</span>
                </div>
                {entry.rowCount != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.rowCount.toLocaleString()} rows{entry.truncated ? " (truncated at 5,000)" : ""}
                  </p>
                )}
                {entry.recipients && (
                  <p className="text-xs text-muted-foreground truncate">→ {entry.recipients}</p>
                )}
                {entry.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{entry.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
