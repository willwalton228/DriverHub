import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { parseDateSafe } from "@/lib/dateFormat";
import { ClaimsCommandBar, CLAIM_STATUS_FILTER_OPTIONS } from "@/components/claims/ClaimsCommandBar";
import { useAuth } from "@/hooks/useAuth";
import { useCarrierMode } from "@/hooks/useCarrierMode";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import type { Accident, DriverWithUser, Customer } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Filter, X, AlertTriangle, Clock, AlertCircle, Ambulance, Car, Bell, GraduationCap, FlaskConical, ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronsUpDown, Shield, ShieldCheck, Copy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatDate } from "@/lib/dateFormat";
import { ClaimStatusBadge } from "@/components/ClaimStatusBadge";

const triageSeverities = ["minor", "moderate", "severe"];

type AccountSearchResult = { id: string; name: string; status: string };

function CustomerSearchCombobox({
  value,
  onChange,
  placeholder = "All customers",
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(inputVal), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputVal]);

  const { data: results = [], isFetching } = useQuery<AccountSearchResult[]>({
    queryKey: ["/api/accounts/search", debouncedQ],
    queryFn: async () => {
      const qs = debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : "";
      const res = await fetch(`/api/accounts/search${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open,
    staleTime: 10_000,
  });

  function handleSelect(account: AccountSearchResult) {
    onChange(account.id, account.name);
    setSelectedLabel(account.name);
    setInputVal("");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("all", "");
    setSelectedLabel("");
    setInputVal("");
  }

  const displayLabel = value !== "all" && selectedLabel ? selectedLabel : value !== "all" ? value : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid="trigger-customer-search"
        >
          <span className="truncate text-left flex-1">
            {displayLabel || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value !== "all" && (
              <span
                role="button"
                onClick={handleClear}
                className="rounded p-0.5 hover:bg-muted"
                data-testid="button-clear-customer-filter"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground opacity-60" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" data-testid="popover-customer-search">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search accounts..."
            value={inputVal}
            onValueChange={setInputVal}
            data-testid="input-customer-search"
          />
          <CommandList>
            {isFetching && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isFetching && results.length === 0 && (
              <CommandEmpty>No accounts found.</CommandEmpty>
            )}
            {!isFetching && results.length > 0 && (
              <CommandGroup>
                {value !== "all" && (
                  <CommandItem
                    key="clear"
                    value="__clear__"
                    onSelect={() => { onChange("all", ""); setSelectedLabel(""); setInputVal(""); setOpen(false); }}
                    data-testid="option-all-customers"
                  >
                    <span className="text-muted-foreground">All Accounts</span>
                  </CommandItem>
                )}
                {results.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={account.id}
                    onSelect={() => handleSelect(account)}
                    data-testid={`option-customer-${account.id}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate">{account.name}</span>
                      {account.status && account.status !== "active" && (
                        <span className="text-[10px] text-muted-foreground capitalize">{account.status}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const claimStatuses = [
  "DRAFT",
  "IN_REVIEW",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "CLOSED",
  // Legacy statuses (backward compat for existing records)
  "UNDER_REVIEW",
  "ADDITIONAL_INFO_REQUESTED",
  "SENT_TO_CARRIER",
  "APPROVED",
  "DENIED",
  "PAID",
];

const claimSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const claimTypes = ["DAMAGE", "ACCIDENT", "INJURY", "PROPERTY", "OTHER"];
const drugTestStatuses = ["not_required", "required", "notified", "acknowledged", "completed", "waived"];

function DrugTestBadge({ 
  required, 
  status, 
  dueBy 
}: { 
  required?: boolean | null;
  status?: string | null;
  dueBy?: string | Date | null;
}) {
  if (!required) {
    return null;
  }
  
  const isOverdue = dueBy && !['completed', 'waived'].includes(status || '') && new Date(dueBy) < new Date();
  
  const variants: Record<string, string> = {
    required: "bg-yellow-500 text-white",
    notified: "bg-blue-500 text-white",
    acknowledged: "bg-indigo-500 text-white",
    completed: "bg-green-600 text-white",
    waived: "bg-gray-500 text-white",
  };

  const labels: Record<string, string> = {
    required: "Required",
    notified: "Notified",
    acknowledged: "Ack'd",
    completed: "Complete",
    waived: "Waived",
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger>
          <Badge className={`${variants[status || 'required'] || "bg-yellow-500 text-white"} text-xs`}>
            <FlaskConical className="h-3 w-3 mr-1" />
            {labels[status || 'required'] || status || 'Required'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Drug Test: {labels[status || 'required'] || status}</TooltipContent>
      </Tooltip>
      {isOverdue && (
        <Tooltip>
          <TooltipTrigger>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>Drug test overdue</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const severityOrder: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return <Badge variant="outline">Unknown</Badge>;
  
  const variants: Record<string, string> = {
    CRITICAL: "bg-red-500 text-white hover:bg-red-600",
    HIGH: "bg-orange-500 text-white hover:bg-orange-600",
    MEDIUM: "bg-yellow-500 text-white hover:bg-yellow-600",
    LOW: "bg-green-500 text-white hover:bg-green-600",
  };

  return (
    <Badge className={variants[severity] || ""}>
      {severity}
    </Badge>
  );
}

function ClaimTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <Badge variant="outline">Unknown</Badge>;
  
  return <Badge variant="secondary">{type}</Badge>;
}

function TriageSeverityBadge({ 
  severity, 
  injuryFlag, 
  drivableFlag, 
  carrierNotificationRequired 
}: { 
  severity: string | null | undefined;
  injuryFlag?: boolean | null;
  drivableFlag?: boolean | null;
  carrierNotificationRequired?: boolean | null;
}) {
  const variants: Record<string, string> = {
    severe: "bg-red-600 text-white",
    moderate: "bg-amber-500 text-white",
    minor: "bg-green-600 text-white",
  };

  const labels: Record<string, string> = {
    severe: "SEVERE",
    moderate: "MODERATE",
    minor: "MINOR",
  };

  return (
    <div className="flex items-center gap-1.5">
      <Badge className={severity ? variants[severity] || "bg-muted" : "bg-muted"}>
        {severity ? labels[severity] || severity.toUpperCase() : "—"}
      </Badge>
      {injuryFlag && (
        <Tooltip>
          <TooltipTrigger>
            <Ambulance className="h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>Injury reported</TooltipContent>
        </Tooltip>
      )}
      {drivableFlag === false && (
        <Tooltip>
          <TooltipTrigger>
            <Car className="h-4 w-4 text-orange-500 opacity-50" />
          </TooltipTrigger>
          <TooltipContent>Vehicle not drivable</TooltipContent>
        </Tooltip>
      )}
      {carrierNotificationRequired && (
        <Tooltip>
          <TooltipTrigger>
            <Bell className="h-4 w-4 text-blue-500" />
          </TooltipTrigger>
          <TooltipContent>Carrier notification required</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const SORT_FIELD_LABELS: Record<string, string> = {
  incidentDate: "Incident Date",
  claimType: "Type",
  claimStatus: "Status",
  daysOpen: "Days Open",
  lastActivity: "Last Activity",
};

const SORT_DIR_LABELS: Record<string, Record<"asc" | "desc", string>> = {
  incidentDate: { asc: "Oldest First", desc: "Newest First" },
  daysOpen: { asc: "Fewest First", desc: "Most First" },
  lastActivity: { asc: "Oldest First", desc: "Most Recent First" },
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  active: "Active Claims",
  all: "All Statuses",
};

// ── Module-level navigation cache ─────────────────────────────────────────────
// Persists search query and scroll position across unmount/remount cycles so
// they can be restored when the user comes back from a Driver Detail page.
// Filter state is already persisted via sessionStorage (CLAIM_FILTER_SESSION_KEY).
interface _ClaimsNavState {
  searchQuery: string;
  scrollY: number;
  pendingRestore: boolean;
}
let _claimsNavCache: _ClaimsNavState | null = null;

function _saveClaimsNavState(searchQuery: string) {
  _claimsNavCache = {
    searchQuery,
    scrollY: window.scrollY,
    pendingRestore: true,
  };
}

const CLAIM_FILTER_SESSION_KEY = "claimListFilters";

const CLAIM_FILTER_DEFAULTS = {
  statusFilter: "active",
  claimStatusValueFilter: "pending",
  driverFilter: "all",
  customerFilter: "all",
  legalHoldFilter: "all",
  dateFrom: "",
  dateTo: "",
  probableCostMin: "",   // minimum probable cost filter (from dashboard high-value drill-down)
  ageDaysMin: "",        // minimum claim age in days  (from dashboard aging-bucket drill-downs)
  ageDaysMax: "",        // maximum claim age in days  (from dashboard aging-bucket drill-downs)
  sortField: "incidentDate" as string | null,
  sortDir: "desc" as "asc" | "desc",
};

function loadClaimFilters(): typeof CLAIM_FILTER_DEFAULTS {
  try {
    const saved = sessionStorage.getItem(CLAIM_FILTER_SESSION_KEY);
    if (saved) return { ...CLAIM_FILTER_DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...CLAIM_FILTER_DEFAULTS };
}

export default function ClaimsQueue() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const { carrierMode, toggleCarrierMode } = useCarrierMode();

  const handleToggleCarrier = useCallback(() => {
    toggleCarrierMode();
    toast({
      title: !carrierMode ? "Carrier Claims View Enabled" : "All Claims View Enabled",
      description: !carrierMode
        ? "Showing only carrier claims across all views."
        : "Showing all claims across all views.",
      duration: 3000,
    });
  }, [carrierMode, toggleCarrierMode, toast]);

  // Read URL params on first render — used when drilling in from an account widget.
  // e.g. /safety?customerId=<id>&status=active
  const urlParams = useMemo(() => new URLSearchParams(search), []);
  const urlCustomerId      = urlParams.get("customerId") ?? undefined;
  const urlStatus          = urlParams.get("status") ?? undefined;
  const urlDateFrom        = urlParams.get("dateFrom") ?? undefined;
  const urlDateTo          = urlParams.get("dateTo") ?? undefined;
  const urlDriverId        = urlParams.get("driverId") ?? undefined;
  const urlProbableCostMin = urlParams.get("probableCostMin") ?? undefined;
  // ageDaysMin / ageDaysMax — set by dashboard aging-bucket drill-downs.
  // Filters claims by days-since-incidentDate so the drill-down result matches the card count exactly.
  const urlAgeDaysMin      = urlParams.get("ageDaysMin") ?? undefined;
  const urlAgeDaysMax      = urlParams.get("ageDaysMax") ?? undefined;
  const fromDashboard      = urlParams.get("from") === "claims-dashboard";

  const _init = loadClaimFilters();
  const [statusFilter, setStatusFilter] = useState<string>(urlStatus ?? _init.statusFilter);
  const [claimStatusValueFilter, setClaimStatusValueFilter] = useState<string>(_init.claimStatusValueFilter ?? "all");
  const [driverFilter, setDriverFilter] = useState<string>(urlDriverId ?? _init.driverFilter);
  const [customerFilter, setCustomerFilter] = useState<string>(urlCustomerId ?? _init.customerFilter);
  const [legalHoldFilter, setLegalHoldFilter] = useState<string>(_init.legalHoldFilter ?? "all");
  const [dateFrom, setDateFrom] = useState<string>(urlDateFrom ?? _init.dateFrom);
  const [dateTo, setDateTo] = useState<string>(urlDateTo ?? _init.dateTo);
  // probableCostMin: URL param wins over session (dashboard drill-down always overrides cached state)
  const [probableCostMin, setProbableCostMin] = useState<string>(urlProbableCostMin ?? _init.probableCostMin);
  // ageDaysMin/ageDaysMax: URL param only — not persisted to session (transient drill-down params)
  const [ageDaysMin, setAgeDaysMin] = useState<string>(urlAgeDaysMin ?? "");
  const [ageDaysMax, setAgeDaysMax] = useState<string>(urlAgeDaysMax ?? "");
  const [sortField, setSortField] = useState<string | null>(_init.sortField);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(_init.sortDir);
  // Restore search query from module-level cache when returning from Driver Detail.
  // Filters are already restored via loadClaimFilters() (sessionStorage).
  const _restoreNav = _claimsNavCache?.pendingRestore === true;
  const [searchQuery, setSearchQuery] = useState<string>(() => _restoreNav ? (_claimsNavCache!.searchQuery) : "");

  // Restore scroll position after mount when returning from Driver Detail.
  useEffect(() => {
    if (_claimsNavCache && _claimsNavCache.pendingRestore) {
      const y = _claimsNavCache.scrollY;
      _claimsNavCache = { ..._claimsNavCache, pendingRestore: false };
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CLAIM_FILTER_SESSION_KEY, JSON.stringify({
        statusFilter, claimStatusValueFilter, driverFilter, customerFilter, legalHoldFilter,
        dateFrom, dateTo, probableCostMin, sortField, sortDir,
      }));
    } catch {}
  }, [statusFilter, claimStatusValueFilter, driverFilter, customerFilter, legalHoldFilter, dateFrom, dateTo, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else { setSortField(null); setSortDir("asc"); }
    } else { setSortField(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30 inline-block align-middle" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline-block align-middle" />
      : <ArrowDown className="h-3 w-3 ml-1 inline-block align-middle" />;
  };

  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const { data: drivers = [] } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  // Driver name: prefer server-resolved driverName (resolves via move fallback too).
  // Fall back to client-side drivers list only as a last resort.
  const getDriverName = (claim: any): string => {
    if (claim.driverName) return claim.driverName;
    const id = claim.resolvedDriverId || claim.driverId;
    if (!id) return "Unassigned";
    const driver = drivers.find((d) => d.id === id);
    return driver ? `${driver.user?.firstName || ""} ${driver.user?.lastName || ""}`.trim() || "Unassigned" : "Unassigned";
  };

  // Effective driver id for navigation (may differ from driverId when resolved via move)
  const getDriverId = (claim: any): string | null =>
    claim.resolvedDriverId || claim.driverId || null;

  const getCustomerName = (customerId: string | null | undefined) => {
    if (!customerId) return "—";
    const customer = customers.find((c) => c.id === customerId);
    return customer?.customerName || "Unknown";
  };

  const formatCost = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return "—";
    if (n === 0) return "$0.00";
    const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // All claim costs are financial losses — always render as accounting negative
    return `($${abs})`;
  };

  const getAge = (claim: any): number | null => {
    const dateStr = claim.incidentDate || claim.accidentDate;
    if (!dateStr) return null;
    const incident = parseDateSafe(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    incident.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - incident.getTime()) / 86_400_000));
  };

  const filteredAndSortedClaims = useMemo(() => {
    let filtered = [...accidents];

    if (carrierMode) {
      filtered = filtered.filter((a) => (a as any).carrierNotificationRequired === true);
    }

    if (statusFilter === "active") {
      filtered = filtered.filter((a) => !["CLOSED", "PAID", "DENIED"].includes(a.claimStatus || ""));
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((a) => a.claimStatus === statusFilter);
    }

    if (claimStatusValueFilter !== "all") {
      filtered = filtered.filter((a) => {
        const effectiveStatus = (a as any).status || a.claimStatus || "DRAFT";
        return effectiveStatus === claimStatusValueFilter;
      });
    }

    if (driverFilter !== "all") {
      filtered = filtered.filter((a) =>
        a.driverId === driverFilter || (a as any).resolvedDriverId === driverFilter
      );
    }

    if (customerFilter !== "all") {
      filtered = filtered.filter((a) => a.customerId === customerFilter);
    }

    if (legalHoldFilter === "active") {
      filtered = filtered.filter((a) => (a as any).litigationHoldActive === true);
    } else if (legalHoldFilter === "none") {
      filtered = filtered.filter((a) => !(a as any).litigationHoldActive);
    }

    if (dateFrom) {
      const fromDate = parseDateSafe(dateFrom);
      filtered = filtered.filter((a) => {
        const incidentDate = a.incidentDate ? parseDateSafe(a.incidentDate) : a.accidentDate ? parseDateSafe(a.accidentDate) : null;
        return incidentDate && incidentDate >= fromDate;
      });
    }

    if (dateTo) {
      const toDate = parseDateSafe(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((a) => {
        const incidentDate = a.incidentDate ? parseDateSafe(a.incidentDate) : a.accidentDate ? parseDateSafe(a.accidentDate) : null;
        return incidentDate && incidentDate <= toDate;
      });
    }

    // probableCostMin: filter to claims where probableCost >= threshold
    // Populated from dashboard "High-value claims" drill-down via URL param probableCostMin
    if (probableCostMin) {
      const minCost = Number(probableCostMin);
      if (!isNaN(minCost) && minCost > 0) {
        filtered = filtered.filter((a) => Number((a as any).probableCost) >= minCost);
      }
    }

    // ageDaysMin / ageDaysMax: filter by days-since-incidentDate (claim age).
    // Set by dashboard aging-bucket drill-downs so the drill-down matches the card count exactly.
    // Uses the same getAge() helper that the dashboard uses (Math.floor(ms / 86_400_000)).
    if (ageDaysMin !== "" || ageDaysMax !== "") {
      const minD = ageDaysMin !== "" ? Number(ageDaysMin) : null;
      const maxD = ageDaysMax !== "" ? Number(ageDaysMax) : null;
      filtered = filtered.filter((a) => {
        const age = getAge(a);
        if (age === null) return false;
        if (minD !== null && age < minD) return false;
        if (maxD !== null && age > maxD) return false;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((a) => {
        const driver = drivers.find(d => d.id === a.driverId);
        const driverName = driver
          ? `${(driver as any).user?.firstName ?? ""} ${(driver as any).user?.lastName ?? ""}`.trim().toLowerCase()
          : "";
        const customer = customers.find(c => c.id === a.customerId);
        const accountName = customer
          ? ((customer as any).customerName || (customer as any).name || "").toLowerCase()
          : "";
        return (
          a.id?.toLowerCase().includes(q) ||
          (a as any).displayClaimId?.toLowerCase().includes(q) ||
          a.moveId?.toLowerCase().includes(q) ||
          a.redcapId?.toLowerCase().includes(q) ||
          driverName.includes(q) ||
          accountName.includes(q) ||
          (a as any).incidentLocation?.toLowerCase().includes(q) ||
          (a as any).vehicleInfo?.toLowerCase().includes(q) ||
          (a as any).incidentType?.toLowerCase().includes(q) ||
          a.claimType?.toLowerCase().includes(q)
        );
      });
    }

    // Default sort by incident date desc
    filtered.sort((a, b) => {
      const dateA = a.incidentDate || a.accidentDate ? new Date(a.incidentDate || a.accidentDate || 0).getTime() : 0;
      const dateB = b.incidentDate || b.accidentDate ? new Date(b.incidentDate || b.accidentDate || 0).getTime() : 0;
      return dateB - dateA;
    });

    if (sortField) {
      filtered.sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortField === "incidentDate") {
          const da = (a.incidentDate || a.accidentDate) ? parseDateSafe(a.incidentDate || a.accidentDate || '').getTime() : 0;
          const db2 = (b.incidentDate || b.accidentDate) ? parseDateSafe(b.incidentDate || b.accidentDate || '').getTime() : 0;
          return dir * (da - db2);
        }
        if (sortField === "incidentType") {
          const ta = (a as any).incidentType || a.claimType || "";
          const tb = (b as any).incidentType || b.claimType || "";
          return dir * ta.localeCompare(tb);
        }
        if (sortField === "claimStatus") return dir * (a.claimStatus || "").localeCompare(b.claimStatus || "");
        if (sortField === "account") {
          const na = getCustomerName(a.customerId) || "";
          const nb = getCustomerName(b.customerId) || "";
          return dir * na.localeCompare(nb);
        }
        if (sortField === "driver") {
          const da = getDriverName(a) || "";
          const db2 = getDriverName(b) || "";
          return dir * da.localeCompare(db2);
        }
        if (sortField === "dodAtFault") {
          const fa = ((a as any).dodAtFault || "").toLowerCase();
          const fb = ((b as any).dodAtFault || "").toLowerCase();
          return dir * fa.localeCompare(fb);
        }
        if (sortField === "moveId") {
          const ma = (a as any).displayClaimId || a.redcapId || a.moveId || a.id;
          const mb = (b as any).displayClaimId || b.redcapId || b.moveId || b.id;
          return dir * ma.localeCompare(mb);
        }
        if (sortField === "probableCost") {
          return dir * ((Number((a as any).probableCost) || 0) - (Number((b as any).probableCost) || 0));
        }
        if (sortField === "actualCost") {
          return dir * ((Number((a as any).actualCost) || 0) - (Number((b as any).actualCost) || 0));
        }
        if (sortField === "submittedBy") {
          const ra = (a as any).reporter;
          const rb = (b as any).reporter;
          const sa = ra ? `${ra.firstName || ""} ${ra.lastName || ""}`.trim() || ra.email || "" : "";
          const sb = rb ? `${rb.firstName || ""} ${rb.lastName || ""}`.trim() || rb.email || "" : "";
          return dir * sa.localeCompare(sb);
        }
        if (sortField === "age") {
          const aa = getAge(a) ?? -1;
          const ab = getAge(b) ?? -1;
          return dir * (aa - ab);
        }
        if (sortField === "lastActivity") {
          const da = (a as any).lastActivityAt
            ? new Date((a as any).lastActivityAt).getTime()
            : new Date((a as any).createdAt || 0).getTime();
          const db2 = (b as any).lastActivityAt
            ? new Date((b as any).lastActivityAt).getTime()
            : new Date((b as any).createdAt || 0).getTime();
          return dir * (da - db2);
        }
        return 0;
      });
    }
    return filtered;
  }, [accidents, carrierMode, statusFilter, claimStatusValueFilter, driverFilter, customerFilter, legalHoldFilter, dateFrom, dateTo, probableCostMin, ageDaysMin, ageDaysMax, sortField, sortDir, searchQuery, drivers, customers]);

  // Navigate to a Driver record, saving Claims list state first so the user
  // can return to the exact same view via the Back button in Driver Detail.
  const navigateToDriver = useCallback((driverId: string) => {
    if (!driverId) return;
    _saveClaimsNavState(searchQuery);
    try { sessionStorage.setItem("driverDetail.returnUrl", "/claims"); } catch {}
    navigate(`/drivers/${driverId}`);
  }, [searchQuery, navigate]);

  const clearFilters = () => {
    setStatusFilter(CLAIM_FILTER_DEFAULTS.statusFilter);
    setClaimStatusValueFilter(CLAIM_FILTER_DEFAULTS.claimStatusValueFilter);
    setDriverFilter(CLAIM_FILTER_DEFAULTS.driverFilter);
    setCustomerFilter(CLAIM_FILTER_DEFAULTS.customerFilter);
    setLegalHoldFilter(CLAIM_FILTER_DEFAULTS.legalHoldFilter);
    setDateFrom(CLAIM_FILTER_DEFAULTS.dateFrom);
    setDateTo(CLAIM_FILTER_DEFAULTS.dateTo);
    setProbableCostMin(CLAIM_FILTER_DEFAULTS.probableCostMin);
    setAgeDaysMin(CLAIM_FILTER_DEFAULTS.ageDaysMin);
    setAgeDaysMax(CLAIM_FILTER_DEFAULTS.ageDaysMax);
    setSortField(CLAIM_FILTER_DEFAULTS.sortField);
    setSortDir(CLAIM_FILTER_DEFAULTS.sortDir);
    try { sessionStorage.removeItem(CLAIM_FILTER_SESSION_KEY); } catch {}
  };

  const isAtDefaults =
    statusFilter === CLAIM_FILTER_DEFAULTS.statusFilter &&
    claimStatusValueFilter === CLAIM_FILTER_DEFAULTS.claimStatusValueFilter &&
    driverFilter === CLAIM_FILTER_DEFAULTS.driverFilter &&
    customerFilter === CLAIM_FILTER_DEFAULTS.customerFilter &&
    legalHoldFilter === CLAIM_FILTER_DEFAULTS.legalHoldFilter &&
    dateFrom === CLAIM_FILTER_DEFAULTS.dateFrom &&
    dateTo === CLAIM_FILTER_DEFAULTS.dateTo &&
    probableCostMin === CLAIM_FILTER_DEFAULTS.probableCostMin &&
    ageDaysMin === CLAIM_FILTER_DEFAULTS.ageDaysMin &&
    ageDaysMax === CLAIM_FILTER_DEFAULTS.ageDaysMax &&
    sortField === CLAIM_FILTER_DEFAULTS.sortField &&
    sortDir === CLAIM_FILTER_DEFAULTS.sortDir;

  const hasActiveFilters = !isAtDefaults;

  const cbActiveFilterCount = [
    customerFilter !== "all",
    driverFilter !== "all",
    legalHoldFilter !== "all",
    !!dateFrom,
    !!dateTo,
    !!probableCostMin,
    !!ageDaysMin,
    !!ageDaysMax,
  ].filter(Boolean).length;
  // Note: claimStatusValueFilter is a primary toolbar control, not counted in the
  // advanced Filters badge — it has its own inline visibility in the toolbar.

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];

    if (statusFilter !== CLAIM_FILTER_DEFAULTS.statusFilter) {
      const label = STATUS_FILTER_LABELS[statusFilter] || statusFilter.replace(/_/g, " ");
      chips.push({ key: "status", label: `View: ${label}` });
    }
    if (claimStatusValueFilter !== CLAIM_FILTER_DEFAULTS.claimStatusValueFilter) {
      const opt = CLAIM_STATUS_FILTER_OPTIONS.find((o) => o.value === claimStatusValueFilter);
      const label = opt?.label ?? claimStatusValueFilter.replace(/_/g, " ");
      chips.push({ key: "claimStatusValue", label: `Status: ${label}` });
    }
    if (customerFilter !== "all") {
      const customer = customers.find((c) => c.id === customerFilter);
      chips.push({ key: "customer", label: `Account: ${(customer as any)?.customerName || (customer as any)?.name || customerFilter}` });
    }
    if (driverFilter !== "all") {
      const driver = drivers.find((d) => d.id === driverFilter);
      const dName = driver ? `${(driver as any).user?.firstName || ""} ${(driver as any).user?.lastName || ""}`.trim() : driverFilter;
      chips.push({ key: "driver", label: `Driver: ${dName || driverFilter}` });
    }
    if (legalHoldFilter !== "all") {
      chips.push({ key: "legalHold", label: `Legal Hold: ${legalHoldFilter === "active" ? "Active" : "None"}` });
    }
    if (dateFrom) chips.push({ key: "dateFrom", label: `Incident Date From: ${dateFrom}` });
    if (dateTo) chips.push({ key: "dateTo", label: `Incident Date To: ${dateTo}` });
    if (probableCostMin) chips.push({ key: "probableCostMin", label: `Min. Probable Cost: $${Number(probableCostMin).toLocaleString()}` });
    if (ageDaysMin !== "" || ageDaysMax !== "") {
      const minLabel = ageDaysMin !== "" ? `${ageDaysMin}d` : "0d";
      const maxLabel = ageDaysMax !== "" ? `${ageDaysMax}d` : "+";
      chips.push({ key: "ageDays", label: `Claim Age: ${minLabel}–${maxLabel}` });
    }

    const sortChanged = sortField !== CLAIM_FILTER_DEFAULTS.sortField || sortDir !== CLAIM_FILTER_DEFAULTS.sortDir;
    if (sortChanged && sortField) {
      const fieldLabel = SORT_FIELD_LABELS[sortField] || sortField;
      const dirLabels = SORT_DIR_LABELS[sortField] || { asc: "A → Z", desc: "Z → A" };
      chips.push({ key: "sort", label: `Sort: ${fieldLabel} (${dirLabels[sortDir]})` });
    } else if (sortChanged && !sortField) {
      chips.push({ key: "sort", label: "Sort: None" });
    }

    return chips;
  }, [statusFilter, claimStatusValueFilter, customerFilter, driverFilter, legalHoldFilter, dateFrom, dateTo, probableCostMin, ageDaysMin, ageDaysMax, sortField, sortDir, customers, drivers]);

  // Map status filter → human label for the page header count line
  const viewLabel = (
    { active: "Active Claims", all: "Claims", NEEDS_EVIDENCE: "Needs Attention", CLOSED: "Closed Claims" } as Record<string, string>
  )[statusFilter] ?? "Claims";

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-[#f7f8fc] dark:bg-background min-h-screen" data-ipad-module="claims">

      {/* ── Sticky zone: page header + toolbar ─────────────────────────────── */}
      {/* bg-background must remain fully opaque — do not add opacity, bg-opacity,
          or backdrop-blur here. z-50 keeps it above all scrolling table rows. */}
      <div className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">

        {/* Page Header */}
        <div className="border-b border-border px-6 py-2">
          <p className="text-xs text-muted-foreground leading-none">
            Operations / <span className="font-medium text-foreground/70">Claims</span>
          </p>
          <div className="flex items-start justify-between mt-0">
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-none">
                  {carrierMode ? "Carrier Claims" : "Claims"}
                </h1>
                {/* Carrier mode toggle — inline with title */}
                <button
                  onClick={handleToggleCarrier}
                  data-testid="button-carrier-mode-toggle"
                  className={`inline-flex items-center justify-center h-5 w-5 rounded transition-colors ${
                    carrierMode
                      ? "text-primary"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                  aria-pressed={carrierMode}
                  aria-label={carrierMode ? "Carrier mode active — click to show all claims" : "Click to enable carrier claims view"}
                >
                  {carrierMode ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 leading-none">
                <span className="font-semibold text-[#5737f2]" data-testid="text-claim-count">
                  {filteredAndSortedClaims.length.toLocaleString("en-US")}
                </span>
                {" "}{viewLabel}{(hasActiveFilters || searchQuery) && <span className="text-muted-foreground/60"> · filtered</span>}
              </p>
            </div>
            <Link href="/claims/new">
              <Button className="h-9 bg-[#5737f2] hover:bg-[#4a2bd3] text-white shrink-0" data-testid="page-header-new-claim">
                + New Claim
              </Button>
            </Link>
          </div>
        </div>

        {/* Toolbar — no title, no primary action (both live in page header above) */}
        <ClaimsCommandBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          claimStatusValueFilter={claimStatusValueFilter}
          onClaimStatusValueChange={setClaimStatusValueFilter}
          customerFilter={customerFilter}
          onCustomerFilterChange={setCustomerFilter}
          driverFilter={driverFilter}
          onDriverFilterChange={setDriverFilter}
          legalHoldFilter={legalHoldFilter}
          onLegalHoldFilterChange={setLegalHoldFilter}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={(field, dir) => { setSortField(field); setSortDir(dir); }}
          activeFilterCount={cbActiveFilterCount}
          onClearFilters={clearFilters}
          drivers={drivers}
          customers={customers}
          claimCount={filteredAndSortedClaims.length}
          carrierMode={carrierMode}
          onToggleCarrier={handleToggleCarrier}
          isSuperAdmin={isSuperAdmin}
          hideTitle
          hidePrimaryAction
          sticky={false}
        />
      </div>

      <div className="space-y-2 px-6 pt-4 pb-6 max-w-[1600px] mx-auto">

        {/* Carrier mode active banner */}
        {carrierMode && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-primary -mb-2" data-testid="banner-carrier-mode-active">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="font-medium">Carrier Claims View</span>
            <span className="text-primary/70 text-xs">— showing only claims marked for carrier notification</span>
          </div>
        )}
        {/* Context banner — shown when drilling in from an account's Open Claims widget */}
        {urlCustomerId && (() => {
          const acct = customers.find((c: any) => c.id === urlCustomerId);
          const acctName = (acct as any)?.customerName || (acct as any)?.name || "Account";
          return (
            <div className="flex items-center justify-between rounded-xl border border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/30 px-4 py-2.5 text-sm -mb-2">
              <span className="text-sm font-semibold text-[#182039] dark:text-foreground">Open Claims — {acctName}</span>
              <Link href={`/customers/${urlCustomerId}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Back to account
              </Link>
            </div>
          );
        })()}
        {/* Back to dashboard banner */}
        {fromDashboard && (
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm -mb-2">
            <span className="text-sm font-semibold text-[#4a2bd3] dark:text-primary">Claims Dashboard</span>
            <Link href="/claims/dashboard" className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              ← Back to Dashboard
            </Link>
          </div>
        )}
        {/* Active Filter Indicator Bar */}
        {filterChips.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/30"
            data-testid="filter-indicator-bar"
          >
            <span className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap shrink-0">
              Active Filters:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {filterChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[#eeebff] text-[#4a2bd3] border-[#d4ccff] dark:bg-primary/10 dark:text-primary dark:border-primary/30"
                  data-testid={`filter-chip-${chip.key}`}
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
              data-testid="filter-bar-clear-button"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        )}

        <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden" data-ipad-table="claims">
          <Table className="min-w-[1280px] [&_td]:py-2 [&_th]:py-2 [&_td]:text-[13px]">
            <TableHeader>
              <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none w-20" onClick={() => handleSort("claimStatus")} data-testid="th-claim-status">Status <SortIcon field="claimStatus" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap text-right cursor-pointer select-none w-10" onClick={() => handleSort("age")} data-testid="th-age">Age <SortIcon field="age" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none w-24" onClick={() => handleSort("lastActivity")} data-testid="th-last-activity">Last Activity <SortIcon field="lastActivity" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none w-24" onClick={() => handleSort("incidentDate")} data-testid="th-incident-date">Incident Date <SortIcon field="incidentDate" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("incidentType")} data-testid="th-incident-type">Incident Type <SortIcon field="incidentType" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none min-w-[240px]" onClick={() => handleSort("account")} data-testid="th-account">Account <SortIcon field="account" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("driver")} data-testid="th-driver">Driver <SortIcon field="driver" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none w-24" onClick={() => handleSort("dodAtFault")} data-testid="th-dod-at-fault">DoD At Fault <SortIcon field="dodAtFault" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("moveId")} data-testid="th-move-id">Move ID <SortIcon field="moveId" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap text-right cursor-pointer select-none" onClick={() => handleSort("probableCost")} data-testid="th-probable-cost">Probable Cost <SortIcon field="probableCost" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap text-right cursor-pointer select-none" onClick={() => handleSort("actualCost")} data-testid="th-actual-cost">Actual Cost <SortIcon field="actualCost" /></TableHead>
                <TableHead className="text-[14px] font-semibold text-foreground/80 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort("submittedBy")} data-testid="th-submitted-by">Submitted By <SortIcon field="submittedBy" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedClaims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-14 px-6 text-muted-foreground">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No claims found matching your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedClaims.map((claim, index) => {
                  const dodAtFault = (claim as any).dodAtFault as string | null | undefined;
                  const incidentType = (claim as any).incidentType || claim.claimType || null;
                  // reporter is joined server-side via accidents.reportedBy → users
                  const reporter = (claim as any).reporter as { firstName: string | null; lastName: string | null; email: string | null } | null;
                  const submittedByName = reporter
                    ? `${reporter.firstName || ""} ${reporter.lastName || ""}`.trim() || reporter.email || null
                    : null;
                  const legalHoldActive = (claim as any).litigationHoldActive;
                  // Operational status (accident.status) takes priority over form state (claimStatus)
                  const effectiveStatus = (claim as any).status || claim.claimStatus || "DRAFT";
                  const driverId = getDriverId(claim);
                  const driverDisplayName = getDriverName(claim);

                  return (
                    <TableRow
                      key={claim.id}
                      className="hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10 border-b border-[#eceef3] dark:border-border last:border-0 cursor-pointer"
                      onClick={() => navigate(`/accidents/${claim.id}`)}
                      data-testid={`claim-row-${index}`}
                    >
                      {/* Status — uses operational accident.status first */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ClaimStatusBadge status={effectiveStatus} size="sm" />
                          {legalHoldActive && (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 uppercase tracking-wide">
                                  Hold
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Legal / Litigation Hold Active</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      {/* Age — calendar days since incident date */}
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        {(() => { const a = getAge(claim); return a !== null ? a.toLocaleString("en-US") : "—"; })()}
                      </TableCell>
                      {/* Last Activity — latest qualifying Claim Timeline event, with creation fallback */}
                      <TableCell className="text-muted-foreground whitespace-nowrap" data-testid={`claim-last-activity-${claim.id}`}>
                        {formatDate((claim as any).lastActivityAt || (claim as any).createdAt)}
                      </TableCell>
                      {/* Incident Date */}
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(claim.incidentDate || claim.accidentDate)}
                      </TableCell>
                      {/* Incident Type */}
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {incidentType ? incidentType.replace(/_/g, " ") : "—"}
                      </TableCell>
                      {/* Account — links to Account Detail */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {claim.customerId ? (
                          <Link href={`/customers/${claim.customerId}`}>
                            <span className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer">
                              {getCustomerName(claim.customerId)}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Driver — server-resolved name; click navigates to Driver Detail */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {driverId ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer text-left"
                            onClick={() => navigateToDriver(driverId)}
                            data-testid={`claim-driver-link-${claim.id}`}
                          >
                            {driverDisplayName}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      {/* DoD At Fault */}
                      <TableCell className="text-muted-foreground">
                        {dodAtFault ? dodAtFault.charAt(0).toUpperCase() + dodAtFault.slice(1) : "—"}
                      </TableCell>
                      {/* Move ID — hover reveals copy icon; stopPropagation prevents row navigation */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const displayId = (claim as any).displayClaimId || claim.redcapId || (claim.moveId ? claim.moveId.slice(0, 8) : claim.id.slice(0, 8));
                          return (
                            <div className="group flex items-center gap-1">
                              <Link href={`/accidents/${claim.id}`}>
                                <span className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer" data-testid={`claim-move-id-${index}`}>
                                  {displayId}
                                </span>
                              </Link>
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(displayId);
                                  toast({ title: "Copied", description: "Move ID copied to clipboard." });
                                }}
                                aria-label="Copy Move ID"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })()}
                      </TableCell>
                      {/* Probable Cost */}
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        {formatCost((claim as any).probableCost)}
                      </TableCell>
                      {/* Actual Cost */}
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                        {formatCost((claim as any).actualCost)}
                      </TableCell>
                      {/* Incident Submitted By — resolved server-side via accidents.reportedBy → users */}
                      <TableCell className="text-muted-foreground">
                        {submittedByName || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
