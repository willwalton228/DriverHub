/**
 * ClaimsAnalysisReport.tsx — DH-002169
 *
 * One configurable report that supports filtering, grouping (Account / Driver / Network),
 * sorting, drill-down, and export. Accessed via Claims → Dashboard → Reports.
 *
 * Filter state is persisted to sessionStorage on unmount so that returning from
 * Claim Detail / Driver Detail / Account Detail fully restores the report.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ChevronLeft, Download, Columns3, X, ChevronDown, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, Loader2, FileText, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClaimStatusBadge } from "@/components/ClaimStatusBadge";
import { exportToExcel } from "@/lib/excelExport";
import { claimResolutionStatusOptions } from "@shared/schema";
import type { Accident, CustomerWithDetails } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────────

const PRIMARY = "#5737f2";
const SESSION_KEY = "claimsAnalysisReport.state";

/** Feb 9 2026 — DriverHub acquisition date / start of current policy period. */
const ACQUISITION_DATE = new Date("2026-02-09T00:00:00");

// Claim Type (authoritative — Insurance Claim vs Internal Claim). claimCategory
// is the sole authoritative field; do not derive this from Incident Type or
// any other classification. DH-002340.
const CLAIM_CATEGORIES = ["insurance_claim", "internal_claim"] as const;
const CLAIM_CATEGORY_LABELS: Record<string, string> = {
  insurance_claim: "Insurance",
  internal_claim: "Internal",
};

const CLOSED_STATUS_SET = new Set([
  "CLOSED", "PAID", "DENIED",
  "closed", "denied", "denied_abandoned", "abandoned",
  "driver_paid", "dod_paid", "insurance_paid", "paid_other_insurance", "paid_jri",
]);

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

interface FilterState {
  datePreset: string;
  customFrom: string;
  customTo: string;
  accountIds: string[];
  driverIds: string[];
  networks: string[];
  claimCategories: string[];
  claimStatuses: string[];
}

type GroupBy = "none" | "account" | "driver" | "network";
type SortDir = "asc" | "desc";

interface ReportRow {
  id: string;
  claimNumber: string;
  incidentDate: Date | null;
  claimAgeDays: number | null;
  driverName: string;
  driverId: string | null;
  customerName: string;
  customerId: string | null;
  network: string | null;
  claimCategory: string | null;
  claimCategoryLabel: string;
  incidentType: string;
  claimStatus: string;
  resolutionStatus: string | null;
  probableCost: number | null;
  actualCost: number | null;
  rawAccident: any;
}

interface GroupResult {
  key: string;
  label: string;
  linkHref?: string;
  rows: ReportRow[];
  totalProbableCost: number;
  totalActualCost: number;
}

interface Summary {
  total: number;
  open: number;
  closed: number;
  totalProbable: number;
  totalActual: number;
  avgCost: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Date utilities
// ────────────────────────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { value: "current_policy", label: "Current Policy Period" },
  { value: "last_week", label: "Last Week" },
  { value: "last_month", label: "Last Month" },
  { value: "month_to_date", label: "Month to Date" },
  { value: "ytd", label: "Year to Date" },
  { value: "prev_policy", label: "Previous Policy Period" },
  { value: "same_time_last_year", label: "Same Time Last Year" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

function computeDateRange(preset: string, customFrom: string, customTo: string): { from: Date; to: Date } {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  switch (preset) {
    case "last_week": {
      const dow = todayStart.getDay();
      const daysToLastMon = dow === 0 ? 6 : dow - 1;
      const lastMon = new Date(todayStart);
      lastMon.setDate(todayStart.getDate() - daysToLastMon - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      lastSun.setHours(23, 59, 59, 999);
      return { from: lastMon, to: lastSun };
    }
    case "last_month": {
      const from = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
      const to = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0, 23, 59, 59, 999);
      return { from, to };
    }
    case "month_to_date": {
      return { from: new Date(todayStart.getFullYear(), todayStart.getMonth(), 1), to: todayEnd };
    }
    case "ytd": {
      return { from: new Date(todayStart.getFullYear(), 0, 1), to: todayEnd };
    }
    case "current_policy": {
      return { from: ACQUISITION_DATE, to: todayEnd };
    }
    case "prev_policy": {
      return { from: new Date("2025-02-09T00:00:00"), to: new Date("2026-02-08T23:59:59") };
    }
    case "same_time_last_year": {
      const from = new Date(ACQUISITION_DATE);
      from.setFullYear(from.getFullYear() - 1);
      const to = new Date(todayEnd);
      to.setFullYear(to.getFullYear() - 1);
      return { from, to };
    }
    case "all_time": {
      return { from: new Date("2020-01-01"), to: todayEnd };
    }
    case "custom": {
      const from = customFrom ? new Date(customFrom + "T00:00:00") : ACQUISITION_DATE;
      const to = customTo ? new Date(customTo + "T23:59:59") : todayEnd;
      return { from: isNaN(from.getTime()) ? ACQUISITION_DATE : from, to: isNaN(to.getTime()) ? todayEnd : to };
    }
    default:
      return { from: ACQUISITION_DATE, to: todayEnd };
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function fmtCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 0) return `(${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })})`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtCurrencyZero(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtAge(days: number | null): string {
  if (days === null) return "—";
  return `${days}d`;
}

function parseDecimal(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? null : n;
}

// ────────────────────────────────────────────────────────────────────────────────
// Build report rows from raw accidents + lookups
// ────────────────────────────────────────────────────────────────────────────────

const TODAY_TS = Date.now();

function buildRows(
  accidents: any[],
  customerMap: Map<string, string>,    // id → customerName
  driverMap: Map<string, string>,      // id → full name
  customerNetworkMap: Map<string, string>, // customerId → Account Network (authoritative, DH-002339)
): ReportRow[] {
  return accidents.map((a) => {
    const rawDate = a.incidentDate || a.accidentDate;
    const incidentDate: Date | null = rawDate ? (() => { const d = new Date(rawDate); return isNaN(d.getTime()) ? null : d; })() : null;
    const claimAgeDays = incidentDate ? Math.round((TODAY_TS - incidentDate.getTime()) / 86400000) : null;
    const customerId: string | null = a.customerId || null;
    const driverId: string | null = a.resolvedDriverId || a.driverId || null;
    // Resolution Status is the Claim's authoritative operational/financial
    // disposition (accident.status) — the same field and values shown on
    // Claim Detail. Never derived from Claim Workflow (claimStatus), Carrier
    // Submission Stage, Readiness, or Claim Type. DH-002337.
    const resolutionStatus: string | null = a.status || null;
    return {
      id: a.id,
      claimNumber: a.displayClaimId || a.redcapId || a.moveId?.slice(0, 8) || a.id.slice(0, 8),
      incidentDate,
      claimAgeDays,
      driverName: a.driverName || (driverId ? driverMap.get(driverId) ?? "Unassigned" : "Unassigned"),
      driverId,
      customerName: customerId ? (customerMap.get(customerId) ?? a.location ?? "—") : (a.location || "—"),
      customerId,
      // Network is derived from the linked Account (customer) record — never
      // stored on the Claim, never a separate Market/Network field. DH-002339.
      network: customerId ? (customerNetworkMap.get(customerId) || null) : null,
      // Claim Type is authoritative from claimCategory only — never derived
      // from Incident Type, damage category, or any other field. DH-002340.
      claimCategory: a.claimCategory || null,
      claimCategoryLabel: a.claimCategory ? (CLAIM_CATEGORY_LABELS[a.claimCategory] || a.claimCategory) : "Not Set",
      incidentType: a.incidentType || "—",
      claimStatus: a.claimStatus || "DRAFT",
      resolutionStatus,
      probableCost: parseDecimal(a.probableCost),
      actualCost: parseDecimal(a.actualCost),
      rawAccident: a,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// Filter logic
// ────────────────────────────────────────────────────────────────────────────────

function applyFilters(rows: ReportRow[], filters: FilterState, dateRange: { from: Date; to: Date }): ReportRow[] {
  return rows.filter((r) => {
    // Date range
    if (r.incidentDate) {
      if (r.incidentDate < dateRange.from || r.incidentDate > dateRange.to) return false;
    }
    // Account
    if (filters.accountIds.length > 0 && !filters.accountIds.includes(r.customerId ?? "")) return false;
    // Driver
    if (filters.driverIds.length > 0 && !filters.driverIds.includes(r.driverId ?? "")) return false;
    // Network (derived from the linked Account, not a Claim field — DH-002339)
    if (filters.networks.length > 0 && !filters.networks.includes(r.network ?? "")) return false;
    // Claim type (authoritative claimCategory — Insurance / Internal)
    if (filters.claimCategories.length > 0 && !filters.claimCategories.includes(r.claimCategory ?? "")) return false;
    // Status = Resolution Status (accident.status), the same authoritative
    // field/values used on Claim Detail. Never matched against Claim
    // Workflow (claimStatus). DH-002337.
    if (filters.claimStatuses.length > 0) {
      const matchesStatus = filters.claimStatuses.some(s =>
        r.resolutionStatus === s ||
        (r.resolutionStatus?.toLowerCase() === s.toLowerCase())
      );
      if (!matchesStatus) return false;
    }
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// Sort
// ────────────────────────────────────────────────────────────────────────────────

function sortRows(rows: ReportRow[], field: string, dir: SortDir): ReportRow[] {
  const asc = dir === "asc";
  return [...rows].sort((a, b) => {
    let av: any, bv: any;
    switch (field) {
      case "claimNumber": av = a.claimNumber; bv = b.claimNumber; break;
      case "incidentDate": av = a.incidentDate?.getTime() ?? -Infinity; bv = b.incidentDate?.getTime() ?? -Infinity; break;
      case "claimAgeDays": av = a.claimAgeDays ?? -1; bv = b.claimAgeDays ?? -1; break;
      case "driverName": av = a.driverName; bv = b.driverName; break;
      case "customerName": av = a.customerName; bv = b.customerName; break;
      case "network": av = a.network ?? ""; bv = b.network ?? ""; break;
      case "claimCategory": av = a.claimCategoryLabel; bv = b.claimCategoryLabel; break;
      case "incidentType": av = a.incidentType; bv = b.incidentType; break;
      case "resolutionStatus": av = a.resolutionStatus ?? ""; bv = b.resolutionStatus ?? ""; break;
      case "probableCost": av = a.probableCost ?? -Infinity; bv = b.probableCost ?? -Infinity; break;
      case "actualCost": av = a.actualCost ?? -Infinity; bv = b.actualCost ?? -Infinity; break;
      default: return 0;
    }
    if (typeof av === "string") return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    return asc ? av - bv : bv - av;
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// Grouping
// ────────────────────────────────────────────────────────────────────────────────

function groupRows(rows: ReportRow[], groupBy: GroupBy): GroupResult[] {
  if (groupBy === "none") return [];
  const groups = new Map<string, GroupResult>();
  for (const r of rows) {
    let key: string, label: string, linkHref: string | undefined;
    if (groupBy === "account") {
      key = r.customerId ?? "__none__";
      label = r.customerName || "No Account";
      linkHref = r.customerId ? `/customers/${r.customerId}` : undefined;
    } else if (groupBy === "driver") {
      key = r.driverId ?? "__none__";
      label = r.driverName || "Unassigned";
      linkHref = r.driverId ? `/drivers/${r.driverId}` : undefined;
    } else {
      key = r.network ?? "__none__";
      label = r.network || "No Network";
    }
    if (!groups.has(key)) {
      groups.set(key, { key, label, linkHref, rows: [], totalProbableCost: 0, totalActualCost: 0 });
    }
    const g = groups.get(key)!;
    g.rows.push(r);
    g.totalProbableCost += r.probableCost ?? 0;
    g.totalActualCost += r.actualCost ?? 0;
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
}

// ────────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────────

function computeSummary(rows: ReportRow[]): Summary {
  let open = 0, closed = 0, totalProbable = 0, totalActual = 0;
  for (const r of rows) {
    const cs = r.claimStatus.toUpperCase();
    const os = (r.resolutionStatus ?? "").toLowerCase();
    if (CLOSED_STATUS_SET.has(cs) || CLOSED_STATUS_SET.has(os)) closed++;
    else open++;
    if (r.probableCost !== null) totalProbable += r.probableCost;
    if (r.actualCost !== null) totalActual += r.actualCost;
  }
  const avgCost = rows.length > 0 ? totalProbable / rows.length : 0;
  return { total: rows.length, open, closed, totalProbable, totalActual, avgCost };
}

// ────────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────────

function buildExportData(rows: ReportRow[], visibleCols: string[]) {
  return rows.map((r) => {
    const rec: Record<string, any> = {};
    if (visibleCols.includes("claimNumber")) rec["Claim #"] = r.claimNumber;
    if (visibleCols.includes("incidentDate")) rec["Date of Loss"] = fmtDate(r.incidentDate);
    if (visibleCols.includes("claimAgeDays")) rec["Claim Age (Days)"] = r.claimAgeDays ?? "";
    if (visibleCols.includes("driverName")) rec["Driver"] = r.driverName;
    if (visibleCols.includes("customerName")) rec["Account / Location"] = r.customerName;
    if (visibleCols.includes("network")) rec["Network"] = r.network ?? "—";
    if (visibleCols.includes("claimCategory")) rec["Claim Type"] = r.claimCategoryLabel;
    if (visibleCols.includes("incidentType")) rec["Incident Type"] = r.incidentType;
    if (visibleCols.includes("resolutionStatus")) rec["Status"] = r.resolutionStatus ?? "—";
    if (visibleCols.includes("probableCost")) rec["Probable Cost"] = r.probableCost !== null ? r.probableCost : "";
    if (visibleCols.includes("actualCost")) rec["Actual Cost"] = r.actualCost !== null ? r.actualCost : "";
    return rec;
  });
}

function exportCsv(rows: ReportRow[], visibleCols: string[], filename: string) {
  const data = buildExportData(rows, visibleCols);
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const lines = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const v = row[h];
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  maxHeight?: number;
  searchable?: boolean;
}

function MultiSelectFilter({ label, options, selected, onChange, maxHeight = 240, searchable }: MultiSelectProps) {
  const [search, setSearch] = useState("");
  const visible = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  const selectAll = () => onChange(options.map(o => o.value));
  const clearAll = () => onChange([]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`
          h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-[12px] font-medium
          transition-colors whitespace-nowrap
          ${selected.length > 0
            ? "border-[#5737f2]/50 bg-[#5737f2]/5 text-[#5737f2]"
            : "border-[#d7dbe4] bg-background text-foreground/70 hover:bg-muted/40"
          }
        `}>
          {label}
          {selected.length > 0 && (
            <span className="bg-[#5737f2] text-white rounded-full text-[9px] h-4 w-4 flex items-center justify-center font-bold">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wide">{label}</span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-[10px] text-[#5737f2] hover:underline">All</button>
            <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:underline">None</button>
          </div>
        </div>
        {searchable && (
          <div className="px-2 pt-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-[12px]"
            />
          </div>
        )}
        <div className="overflow-y-auto py-1" style={{ maxHeight }}>
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">No options</p>
          ) : visible.map(o => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[12px] text-foreground/80 truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ColDef { key: string; label: string; defaultVisible: boolean; }

const ALL_COLUMNS: ColDef[] = [
  { key: "claimNumber",    label: "Claim #",            defaultVisible: true },
  { key: "incidentDate",   label: "Date of Loss",        defaultVisible: true },
  { key: "claimAgeDays",   label: "Claim Age",           defaultVisible: true },
  { key: "driverName",     label: "Driver",              defaultVisible: true },
  { key: "customerName",   label: "Account / Location",  defaultVisible: true },
  { key: "network",        label: "Network",             defaultVisible: true },
  { key: "claimCategory",  label: "Claim Type",          defaultVisible: true },
  { key: "incidentType",   label: "Incident Type",       defaultVisible: false },
  { key: "resolutionStatus",label: "Status",             defaultVisible: true },
  { key: "probableCost",   label: "Probable Cost",       defaultVisible: true },
  { key: "actualCost",     label: "Actual Cost",         defaultVisible: true },
];

const DEFAULT_VISIBLE_COLS = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

function ColumnSelector({ visible, onChange }: { visible: string[]; onChange: (v: string[]) => void }) {
  const toggle = (key: string) => {
    onChange(visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[12px] border-[#d7dbe4] px-2.5">
          <Columns3 className="h-3.5 w-3.5 mr-1.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0" align="end">
        <div className="p-2 border-b border-border">
          <span className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wide">Columns</span>
        </div>
        <div className="py-1">
          {ALL_COLUMNS.map(c => (
            <label key={c.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer">
              <Checkbox
                checked={visible.includes(c.key)}
                onCheckedChange={() => toggle(c.key)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[12px]">{c.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortIcon({ field, activeField, dir }: { field: string; activeField: string; dir: SortDir }) {
  if (field !== activeField) return <ArrowUpDown className="h-3 w-3 opacity-30 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3 ml-1 shrink-0" style={{ color: PRIMARY }} />
    : <ArrowDown className="h-3 w-3 ml-1 shrink-0" style={{ color: PRIMARY }} />;
}

// ────────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: FilterState = {
  datePreset: "current_policy",
  customFrom: "",
  customTo: "",
  accountIds: [],
  driverIds: [],
  networks: [],
  claimCategories: [],
  claimStatuses: [],
};

export default function ClaimsAnalysisReport() {
  const [, navigate] = useLocation();

  // ── Restore persisted state on mount ────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        return { ...DEFAULT_FILTERS, ...p.filters };
      }
    } catch {}
    return DEFAULT_FILTERS;
  });

  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved).groupBy ?? "none";
    } catch {}
    return "none";
  });

  const [sortField, setSortField] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved).sortField ?? "incidentDate";
    } catch {}
    return "incidentDate";
  });

  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved).sortDir ?? "desc";
    } catch {}
    return "desc";
  });

  const [visibleCols, setVisibleCols] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) return JSON.parse(saved).visibleCols ?? DEFAULT_VISIBLE_COLS.join(",");
    } catch {}
    return DEFAULT_VISIBLE_COLS.join(",");
  });

  const visibleColumns = useMemo(() => visibleCols.split(",").filter(Boolean), [visibleCols]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Persist state on unmount ─────────────────────────────────────────────────
  const stateRef = useRef({ filters, groupBy, sortField, sortDir, visibleCols });
  stateRef.current = { filters, groupBy, sortField, sortDir, visibleCols };

  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateRef.current));
      } catch {}
    };
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: accidents = [], isLoading: loadingAccidents } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
    staleTime: 2 * 60 * 1000,
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: driversData = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/drivers"],
    staleTime: 5 * 60 * 1000,
  });

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    (customers as any[]).forEach((c: any) => { if (c.id) m.set(c.id, c.customerName || c.name || c.id); });
    return m;
  }, [customers]);

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    (driversData as any[]).forEach((d: any) => {
      const name = d.user ? `${d.user.firstName || ""} ${d.user.lastName || ""}`.trim() : (d.driverName || "");
      if (d.id) m.set(d.id, name || "Unassigned");
    });
    return m;
  }, [driversData]);

  // Network is the Account's own authoritative field (customers.network) — never
  // a separate Claims-level Market/Network concept, never copied onto the Claim,
  // never inferred from address/location. DH-002339.
  const customerNetworkMap = useMemo(() => {
    const m = new Map<string, string>();
    (customers as any[]).forEach((c: any) => { if (c.id && c.network) m.set(c.id, c.network); });
    return m;
  }, [customers]);

  // ── Filter option lists ──────────────────────────────────────────────────────
  const accountOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (accidents as any[]).forEach((a: any) => {
      const id = a.customerId;
      if (id && !seen.has(id)) {
        seen.add(id);
        opts.push({ value: id, label: customerMap.get(id) || id });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [accidents, customerMap]);

  const driverOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (accidents as any[]).forEach((a: any) => {
      const id = a.resolvedDriverId || a.driverId;
      if (id && !seen.has(id)) {
        seen.add(id);
        const name = a.driverName || driverMap.get(id) || id;
        opts.push({ value: id, label: name });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [accidents, driverMap]);

  // Options populate from the authoritative Account Network values actually
  // represented in the Claims dataset (via each Claim's linked Account).
  const networkOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (accidents as any[]).forEach((a: any) => {
      const customerId = a.customerId;
      const network = customerId ? customerNetworkMap.get(customerId) : undefined;
      if (network && !seen.has(network)) {
        seen.add(network);
        opts.push({ value: network, label: network });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [accidents, customerNetworkMap]);

  // ── Build and filter rows ────────────────────────────────────────────────────
  const allRows = useMemo(() =>
    buildRows(accidents as any[], customerMap, driverMap, customerNetworkMap),
    [accidents, customerMap, driverMap, customerNetworkMap]
  );

  const dateRange = useMemo(() =>
    computeDateRange(filters.datePreset, filters.customFrom, filters.customTo),
    [filters.datePreset, filters.customFrom, filters.customTo]
  );

  const filteredRows = useMemo(() =>
    applyFilters(allRows, filters, dateRange),
    [allRows, filters, dateRange]
  );

  const sortedRows = useMemo(() =>
    sortRows(filteredRows, sortField, sortDir),
    [filteredRows, sortField, sortDir]
  );

  const groups = useMemo(() =>
    groupBy === "none" ? [] : groupRows(filteredRows, groupBy).map(g => ({
      ...g,
      rows: sortRows(g.rows, sortField, sortDir),
    })),
    [filteredRows, groupBy, sortField, sortDir]
  );

  const summary = useMemo(() => computeSummary(filteredRows), [filteredRows]);

  // ── Active filter count ──────────────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.accountIds.length > 0) n++;
    if (filters.driverIds.length > 0) n++;
    if (filters.networks.length > 0) n++;
    if (filters.claimCategories.length > 0) n++;
    if (filters.claimStatuses.length > 0) n++;
    return n;
  }, [filters]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: string) => {
    setSortDir(prev => sortField === field ? (prev === "asc" ? "desc" : "asc") : "desc");
    setSortField(field);
  }, [sortField]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleExportCsv = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    exportCsv(sortedRows, visibleColumns, `claims-analysis-${today}.csv`);
  }, [sortedRows, visibleColumns]);

  const handleExportXlsx = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const data = buildExportData(sortedRows, visibleColumns);
    if (data.length === 0) return;
    const cols = Object.keys(data[0]).map(h => ({ header: h, key: h, width: 18 }));
    exportToExcel(data, cols, `claims-analysis-${today}`);
  }, [sortedRows, visibleColumns]);

  const isLoading = loadingAccidents;

  // ── Th helper ────────────────────────────────────────────────────────────────
  const Th = ({ field, align = "left", children }: { field: string; align?: "left" | "right"; children: React.ReactNode }) => (
    <TableHead
      className={`text-[12px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none py-2 ${align === "right" ? "text-right" : ""}`}
      onClick={() => handleSort(field)}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        <SortIcon field={field} activeField={sortField} dir={sortDir} />
      </span>
    </TableHead>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="border-b border-border px-6 py-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">
              Claims /{" "}
              <Link href="/claims/dashboard"><span className="hover:underline cursor-pointer font-medium text-foreground/70">Dashboard</span></Link>{" "}
              /{" "}
              <Link href="/claims/reports"><span className="hover:underline cursor-pointer font-medium text-foreground/70">Reports</span></Link>{" "}
              / <span className="font-medium text-foreground/70">Claims Analysis</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-tight mt-0.5">
              Claims Analysis Report
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <ColumnSelector visible={visibleColumns} onChange={v => setVisibleCols(v.join(","))} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[12px] border-[#d7dbe4] px-2.5">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCsv} className="text-[13px]">
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXlsx} className="text-[13px]">
                  Export Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link href="/claims/reports">
              <Button variant="outline" size="sm" className="h-7 text-[12px] border-[#d7dbe4] px-2.5">
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Reports
              </Button>
            </Link>
            <Link href="/claims/dashboard">
              <Button variant="outline" size="sm" className="h-7 text-[12px] border-[#d7dbe4] px-2.5">
                <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        <div className="border-b border-border/50 px-6 py-2 flex items-center gap-2 flex-wrap bg-background">

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium">Date:</span>
            <Select value={filters.datePreset} onValueChange={v => setFilters(f => ({ ...f, datePreset: v }))}>
              <SelectTrigger className={`h-7 text-[12px] border-[#d7dbe4] px-2 min-w-[160px] ${filters.datePreset !== "current_policy" ? "border-[#5737f2]/50 bg-[#5737f2]/5 text-[#5737f2]" : ""}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-[12px]">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom date inputs */}
          {filters.datePreset === "custom" && (
            <>
              <Input
                type="date"
                value={filters.customFrom}
                onChange={e => setFilters(f => ({ ...f, customFrom: e.target.value }))}
                className="h-7 text-[12px] w-[130px] border-[#d7dbe4]"
              />
              <span className="text-[11px] text-muted-foreground">—</span>
              <Input
                type="date"
                value={filters.customTo}
                onChange={e => setFilters(f => ({ ...f, customTo: e.target.value }))}
                className="h-7 text-[12px] w-[130px] border-[#d7dbe4]"
              />
            </>
          )}

          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />

          {/* Multi-select filters */}
          <MultiSelectFilter
            label="Account"
            options={accountOptions}
            selected={filters.accountIds}
            onChange={v => setFilters(f => ({ ...f, accountIds: v }))}
            searchable
          />
          <MultiSelectFilter
            label="Driver"
            options={driverOptions}
            selected={filters.driverIds}
            onChange={v => setFilters(f => ({ ...f, driverIds: v }))}
            searchable
          />
          <MultiSelectFilter
            label="Network"
            options={networkOptions}
            selected={filters.networks}
            onChange={v => setFilters(f => ({ ...f, networks: v }))}
          />
          <MultiSelectFilter
            label="Claim Type"
            options={CLAIM_CATEGORIES.map(c => ({ value: c, label: CLAIM_CATEGORY_LABELS[c] }))}
            selected={filters.claimCategories}
            onChange={v => setFilters(f => ({ ...f, claimCategories: v }))}
          />
          <MultiSelectFilter
            label="Status"
            options={claimResolutionStatusOptions.map(s => ({ value: s.value, label: s.label }))}
            selected={filters.claimStatuses}
            onChange={v => setFilters(f => ({ ...f, claimStatuses: v }))}
          />

          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />

          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium">Group:</span>
            <Select value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setExpandedGroups(new Set()); }}>
              <SelectTrigger className="h-7 text-[12px] border-[#d7dbe4] px-2 min-w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[12px]">None (Flat)</SelectItem>
                <SelectItem value="account" className="text-[12px]">By Account</SelectItem>
                <SelectItem value="driver" className="text-[12px]">By Driver</SelectItem>
                <SelectItem value="network" className="text-[12px]">By Network</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="h-3 w-3" />
              Clear {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-3 pb-10 max-w-[1600px] mx-auto space-y-3">

        {/* ── Summary strip ─────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl px-4 py-2.5 flex items-center gap-5 flex-wrap divide-x divide-border/60">
          {[
            { label: "Total Claims",        value: summary.total.toLocaleString() },
            { label: "Open",                value: summary.open.toLocaleString() },
            { label: "Closed",              value: summary.closed.toLocaleString() },
            { label: "Total Probable Cost", value: fmtCurrencyZero(summary.totalProbable) },
            { label: "Total Actual Cost",   value: fmtCurrencyZero(summary.totalActual) },
            { label: "Avg Cost / Claim",    value: fmtCurrencyZero(summary.avgCost) },
          ].map((m, i) => (
            <div key={m.label} className={`${i > 0 ? "pl-5" : ""} flex flex-col min-w-0`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{m.label}</span>
              <span className="text-[15px] font-bold tabular-nums text-[#182039] dark:text-foreground leading-tight mt-0.5">{m.value}</span>
            </div>
          ))}
          <div className="pl-5 ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            {filteredRows.length.toLocaleString()} claim{filteredRows.length !== 1 ? "s" : ""} shown
          </div>
        </div>

        {/* ── Report table ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl px-6 py-14 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground font-medium">No claims match the selected filters.</p>
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="mt-2 text-xs text-[#5737f2] hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">
            <Table className="[&_td]:py-2 [&_th]:py-2 [&_td]:text-[13px]">
              <TableHeader>
                <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                  {groupBy !== "none" && <TableHead className="w-8 py-2" />}
                  {visibleColumns.includes("claimNumber")     && <Th field="claimNumber">Claim #</Th>}
                  {visibleColumns.includes("incidentDate")    && <Th field="incidentDate">Date of Loss</Th>}
                  {visibleColumns.includes("claimAgeDays")    && <Th field="claimAgeDays">Claim Age</Th>}
                  {visibleColumns.includes("driverName")      && <Th field="driverName">Driver</Th>}
                  {visibleColumns.includes("customerName")    && <Th field="customerName">Account / Location</Th>}
                  {visibleColumns.includes("network")          && <Th field="network">Network</Th>}
                  {visibleColumns.includes("claimCategory")   && <Th field="claimCategory">Claim Type</Th>}
                  {visibleColumns.includes("incidentType")    && <Th field="incidentType">Incident Type</Th>}
                  {visibleColumns.includes("resolutionStatus") && <Th field="resolutionStatus">Status</Th>}
                  {visibleColumns.includes("probableCost")    && <Th field="probableCost" align="right">Probable Cost</Th>}
                  {visibleColumns.includes("actualCost")      && <Th field="actualCost" align="right">Actual Cost</Th>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupBy === "none" ? (
                  sortedRows.map(r => (
                    <ClaimRow key={r.id} row={r} visibleColumns={visibleColumns} groupBy={groupBy} />
                  ))
                ) : (
                  groups.map(g => (
                    <>
                      {/* Group header */}
                      <TableRow
                        key={`group-${g.key}`}
                        className="bg-[#f4f5fb] dark:bg-muted/20 border-b border-[#e4e7ee] dark:border-border hover:bg-[#eeeffe] dark:hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleGroup(g.key)}
                      >
                        <TableCell className="w-8 py-2">
                          {expandedGroups.has(g.key)
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell
                          colSpan={visibleColumns.length - (visibleColumns.includes("probableCost") ? 1 : 0) - (visibleColumns.includes("actualCost") ? 1 : 0)}
                          className="py-2"
                        >
                          <div className="flex items-center gap-2">
                            {g.linkHref ? (
                              <span
                                onClick={e => { e.stopPropagation(); navigate(g.linkHref!); }}
                                className="font-semibold text-[13px] text-[#5737f2] hover:underline cursor-pointer"
                              >
                                {g.label}
                              </span>
                            ) : (
                              <span className="font-semibold text-[13px]">{g.label}</span>
                            )}
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {g.rows.length} claim{g.rows.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </TableCell>
                        {visibleColumns.includes("probableCost") && (
                          <TableCell className="text-right tabular-nums font-semibold text-[13px] py-2 whitespace-nowrap">
                            {fmtCurrencyZero(g.totalProbableCost)}
                          </TableCell>
                        )}
                        {visibleColumns.includes("actualCost") && (
                          <TableCell className="text-right tabular-nums font-semibold text-[13px] py-2 whitespace-nowrap">
                            {fmtCurrencyZero(g.totalActualCost)}
                          </TableCell>
                        )}
                      </TableRow>
                      {/* Group rows — only when expanded */}
                      {expandedGroups.has(g.key) && g.rows.map(r => (
                        <ClaimRow key={r.id} row={r} visibleColumns={visibleColumns} groupBy={groupBy} indented />
                      ))}
                    </>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Table footer */}
            <div className="border-t border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/20 px-4 py-2 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">
                {filteredRows.length.toLocaleString()} claim{filteredRows.length !== 1 ? "s" : ""}
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`}
              </span>
              <div className="flex items-center gap-5 text-right">
                {visibleColumns.includes("probableCost") && (
                  <div>
                    <span className="text-muted-foreground">Total Probable: </span>
                    <span className="font-semibold tabular-nums">{fmtCurrencyZero(summary.totalProbable)}</span>
                  </div>
                )}
                {visibleColumns.includes("actualCost") && (
                  <div>
                    <span className="text-muted-foreground">Total Actual: </span>
                    <span className="font-semibold tabular-nums">{fmtCurrencyZero(summary.totalActual)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Claim row (flat or within a group)
// ────────────────────────────────────────────────────────────────────────────────

function ClaimRow({
  row,
  visibleColumns,
  groupBy,
  indented,
}: {
  row: ReportRow;
  visibleColumns: string[];
  groupBy: GroupBy;
  indented?: boolean;
}) {
  return (
    <TableRow className="border-b border-[#eceef3] dark:border-border last:border-0 hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10">
      {groupBy !== "none" && <TableCell className="w-8" />}

      {visibleColumns.includes("claimNumber") && (
        <TableCell className={indented ? "pl-6" : ""}>
          <Link href={`/accidents/${row.id}`}>
            <span className="text-[#5737f2] hover:underline cursor-pointer font-mono text-[12px]">
              {row.claimNumber}
            </span>
          </Link>
        </TableCell>
      )}

      {visibleColumns.includes("incidentDate") && (
        <TableCell className="text-muted-foreground whitespace-nowrap text-[12px]">
          {fmtDate(row.incidentDate)}
        </TableCell>
      )}

      {visibleColumns.includes("claimAgeDays") && (
        <TableCell className="text-muted-foreground text-[12px] tabular-nums">
          {fmtAge(row.claimAgeDays)}
        </TableCell>
      )}

      {visibleColumns.includes("driverName") && (
        <TableCell>
          {row.driverId ? (
            <Link href={`/drivers/${row.driverId}`}>
              <span className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer text-[12px]">
                {row.driverName}
              </span>
            </Link>
          ) : (
            <span className="text-muted-foreground text-[12px]">{row.driverName}</span>
          )}
        </TableCell>
      )}

      {visibleColumns.includes("customerName") && (
        <TableCell>
          {row.customerId ? (
            <Link href={`/customers/${row.customerId}`}>
              <span className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer text-[12px]">
                {row.customerName}
              </span>
            </Link>
          ) : (
            <span className="text-muted-foreground text-[12px]">{row.customerName}</span>
          )}
        </TableCell>
      )}

      {visibleColumns.includes("network") && (
        <TableCell className="text-muted-foreground text-[12px]">{row.network || "—"}</TableCell>
      )}

      {visibleColumns.includes("claimCategory") && (
        <TableCell className="text-muted-foreground text-[12px]">
          {row.claimCategory ? (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-[#d7dbe4]">
              {row.claimCategoryLabel}
            </Badge>
          ) : "—"}
        </TableCell>
      )}

      {visibleColumns.includes("incidentType") && (
        <TableCell className="text-muted-foreground text-[12px] max-w-[140px] truncate">
          {row.incidentType !== "—" ? row.incidentType.replace(/_/g, " ") : "—"}
        </TableCell>
      )}

      {visibleColumns.includes("resolutionStatus") && (
        <TableCell>
          <ClaimStatusBadge status={row.resolutionStatus} size="sm" />
        </TableCell>
      )}

      {visibleColumns.includes("probableCost") && (
        <TableCell className="text-right tabular-nums whitespace-nowrap text-[12px]">
          {fmtCurrency(row.probableCost)}
        </TableCell>
      )}

      {visibleColumns.includes("actualCost") && (
        <TableCell className="text-right tabular-nums whitespace-nowrap text-[12px]">
          {fmtCurrency(row.actualCost)}
        </TableCell>
      )}
    </TableRow>
  );
}
