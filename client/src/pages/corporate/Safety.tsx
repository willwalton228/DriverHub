import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCarrierMode } from "@/hooks/useCarrierMode";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDate as formatDateShared, parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Upload, Loader2, Search, Plus, ArrowUpDown, ChevronDown, X, AlertTriangle, TrendingUp, TrendingDown, Clock, MapPin, User, Camera, ShieldAlert, Shield, ShieldCheck, BarChart3, Target, FileWarning, CalendarIcon, DollarSign, Info, GripVertical, LayoutDashboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import type { Accident, DriverWithUser, Customer } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { AddClaimDialog } from "@/components/AddClaimDialog";
import { StatusBadge } from "@/components/StatusBadge";

// Scorecard response type
interface DashboardScorecard {
  calculatedAt: string;
  driverScorecard: {
    claimsPer1k30Days: number;
    claimsPer1k90Days: number;
    severityWeightedLossScore: number;
    repeatIncidentDriverCount: number;
    repeatIncidentDriverIds: string[];
    preventablePercent: number;
    preventableCount: number;
    totalClaims90Days: number;
  };
  riskSignals: {
    highRiskMoveCount: number;
    claimsFromHighRiskPercent: number;
    avgRiskScore: number;
    totalMoves90Days: number;
  };
  evidenceCompliance: {
    pickupCompliancePercent: number;
    dropoffCompliancePercent: number;
    fullCompliancePercent: number;
    photoComplianceRate: number;
    claimsWithFullEvidence: number;
    claimsWithPartialEvidence: number;
    claimsMissingPhotos: number;
    claimsWithFullEvidencePercent: number;
    successRateWithEvidence: number | null;
    successRateWithoutEvidence: number | null;
    totalMoves90Days: number;
    totalClaims: number;
    claimsChecked: number; // backward compatibility
  };
  lossPatterns: {
    topLocations: { location: string; count: number }[];
    topDriversBySeverity: { driverId: string; name: string; claimCount: number; score: number }[];
    peakTimeWindow: string;
    peakTimePercent: number;
    timeDistribution: { morning: number; afternoon: number; evening: number; night: number };
  };
  carrierKpis: {
    avgDaysToClose: number;
    openClaimsOver30Days: number;
    claimsTrendPercent: number;
    claims30Days: number;
    totalClaimsCost: number;
    openClaimsCount: number;
  };
  goLiveSummary: {
    claimsSinceGoLive: number;
    claimsMtd: number;
    goLiveDate: string;
  };
  thresholds: {
    claimsPer1kWarning: number;
    severityScoreWarning: number;
    repeatDriverWarning: number;
    preventableWarning: number;
    riskScoreWarning: number;
    daysToCloseWarning: number;
    openOver30Warning: number;
  };
}

const VALID_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "abandoned", label: "Abandoned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "denied", label: "Denied" },
  { value: "driver_paid", label: "Driver Paid" },
  { value: "insurance_paid", label: "Insurance Paid" },
  { value: "dod_paid", label: "DoD Paid" },
] as const;

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return formatDateShared(date) || "—";
}

function formatCurrency(amount: string | null): string {
  if (!amount) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(parseFloat(amount));
}



type SortField = "status" | "date" | "incidentType" | "customer" | "driver" | "dodAtFault" | "actualCost" | "moveId" | "probableCost" | "submittedBy";
type SortDirection = "asc" | "desc";

// ── Safety widget DnD infrastructure ──────────────────────────────────────────
const SAFETY_WIDGET_IDS = [
  "total-claims", "open-claims", "probable-cost", "closed-vs-probable", "claims-per-1k", "avg-cost-month",
] as const;
type SafetyWidgetId = (typeof SAFETY_WIDGET_IDS)[number];
const SAFETY_STORAGE_KEY = (userId: string) => `safety_widget_order_${userId}`;

function SortableWidget({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} className="group">
      <button
        type="button"
        aria-label="Drag to reorder"
        className="absolute top-2 left-2 z-20 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none bg-background/80 shadow-sm"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}

export default function Safety() {
  const { toast } = useToast();
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

  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    const allowed = [
      "active", "all", "pending", "investigating", "resolved",
      "closed", "abandoned", "cancelled", "denied",
      "driver_paid", "insurance_paid", "dod_paid",
    ];
    return s && allowed.includes(s) ? s : "active";
  });
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("customerId") || "all";
  });
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [legalHoldFilter, setLegalHoldFilter] = useState<"all" | "active_hold" | "no_hold">("all");

  const [dashboardCollapsed, setDashboardCollapsed] = useState<boolean>(
    () => sessionStorage.getItem("claimsDashboardCollapsed") === "true"
  );
  const toggleDashboard = () => {
    setDashboardCollapsed(prev => {
      const next = !prev;
      sessionStorage.setItem("claimsDashboardCollapsed", String(next));
      return next;
    });
  };
  const [highlightedClaimId, setHighlightedClaimId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth (for DnD storage key) ──
  const { user } = useAuth();

  // ── Widget drag-and-drop ──
  const [widgetOrder, setWidgetOrder] = useState<SafetyWidgetId[]>([...SAFETY_WIDGET_IDS]);
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(SAFETY_STORAGE_KEY(user.id));
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          Array.isArray(parsed) &&
          parsed.length === SAFETY_WIDGET_IDS.length &&
          parsed.every((id): id is SafetyWidgetId => (SAFETY_WIDGET_IDS as readonly string[]).includes(id))
        ) {
          setWidgetOrder(parsed);
        }
      }
    } catch { /* ignore */ }
  }, [user?.id]);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleWidgetDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgetOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as SafetyWidgetId);
      const newIdx = prev.indexOf(over.id as SafetyWidgetId);
      const next = arrayMove(prev, oldIdx, newIdx);
      if (user?.id) { try { localStorage.setItem(SAFETY_STORAGE_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  }, [user?.id]);

  // ── Widget drill-down: Sheet that opens with filtered claims ──
  const claimsListRef = useRef<HTMLDivElement>(null);

  interface DrillSheetState {
    widgetId: SafetyWidgetId;
    title: string;
    description: string;
    claims: Accident[];
  }
  const [drillSheet, setDrillSheet] = useState<DrillSheetState | null>(null);

  // Keep legacy scroll-based drill for fallback
  const drillIntoList = (status: string, from?: string) => {
    setStatusFilter(status);
    if (from !== undefined) setDateFrom(from);
    setTimeout(() => {
      claimsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const { data: accidents, isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  // Fetch all active case-scoped legal holds for filter support
  const { data: caseHolds = [] } = useQuery<{ id: string; scopeId: string; isActive: boolean }[]>({
    queryKey: ["/api/legal-holds", "case-all"],
    queryFn: async () => {
      const res = await fetch("/api/legal-holds?scopeType=case&includeReleased=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const caseIdsWithActiveHold = useMemo(() =>
    new Set(caseHolds.filter(h => h.isActive).map(h => h.scopeId)),
    [caseHolds]
  );

  const { data: drivers = [] } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const { data: scorecard, isLoading: scorecardLoading, error: scorecardError } = useQuery<DashboardScorecard>({
    queryKey: ["/api/claims/dashboard-scorecard"],
    refetchInterval: 30_000, // Refresh every 30 seconds
    retry: 1,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/corporate/accidents/import");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents"] });
      
      let description = `Imported ${data.imported} claims`;
      if (data.skipped > 0) description += `, skipped ${data.skipped} duplicates`;
      if (data.errorCount > 0) description += `, ${data.errorCount} errors`;
      description += `.`;
      
      if (data.rowErrors && data.rowErrors.length > 0) {
        const firstError = data.rowErrors[0];
        description += ` First error: Row ${firstError.row}${firstError.column ? ` (${firstError.column})` : ''}: ${firstError.message}`;
      }

      toast({
        title: data.imported > 0 ? "Import Complete" : "Import Completed with Issues",
        description,
        variant: data.errorCount > 0 ? "default" : "default",
      });
    },
    onError: (error: any) => {
      let description = error.message || "Failed to import claims from Excel file.";
      
      if (error.missingColumns && error.missingColumns.length > 0) {
        description = `Missing required columns: ${error.missingColumns.join(', ')}`;
      } else if (error.guidance) {
        description = `${error.message}. ${error.guidance}`;
      } else if (error.availableSheets) {
        description = `${error.message}. Available sheets: ${error.availableSheets.join(', ')}`;
      }
      
      toast({
        title: "Import Failed",
        description,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (highlightedClaimId && accidents) {
      const timer = setTimeout(() => {
        const row = document.querySelector(`[data-testid="row-accident-${highlightedClaimId}"]`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightedClaimId, accidents]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  const getDriverName = (driverId: string | null, serverDriverName?: string | null) => {
    if (serverDriverName) return serverDriverName;
    if (!driverId) return "Unassigned";
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return "Unassigned";
    return `${driver.user?.firstName || ""} ${driver.user?.lastName || ""}`.trim() || "Unassigned";
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return "—";
    const customer = customers.find((c) => c.id === customerId);
    return customer?.customerName || "—";
  };

  const uniqueDriversInClaims = useMemo(() => {
    if (!accidents) return [];
    const seen = new Map<string, string>();
    for (const a of accidents) {
      const id: string | null = (a as any).resolvedDriverId || a.driverId;
      const name: string | null = (a as any).driverName;
      if (id && !seen.has(id)) {
        seen.set(id, name || getDriverName(id));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [accidents, drivers]);

  const uniqueCustomersInClaims = useMemo(() => {
    if (!accidents) return [];
    const customerIds = Array.from(new Set(accidents.map(a => (a as any).customerId).filter(Boolean)));
    return customerIds.map(id => {
      const customer = customers.find(c => c.id === id);
      return customer ? { id, name: customer.customerName } : null;
    }).filter(Boolean) as { id: string; name: string }[];
  }, [accidents, customers]);

  const filteredAndSortedAccidents = useMemo(() => {
    if (!accidents) return [];

    let result = [...accidents];

    if (carrierMode) {
      result = result.filter((a) => (a as any).carrierNotificationRequired === true);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter((accident) => {
        const driverName = getDriverName(accident.driverId, (accident as any).driverName).toLowerCase();
        const moveId = (accident.redcapId || "").toLowerCase();
        const location = (accident.location || "").toLowerCase();
        const dateStr = formatDate(accident.accidentDate).toLowerCase();
        const customerName = getCustomerName((accident as any).customerId).toLowerCase();
        
        return (
          driverName.includes(search) ||
          moveId.includes(search) ||
          location.includes(search) ||
          dateStr.includes(search) ||
          customerName.includes(search)
        );
      });
    }

    const ACTIVE_STATUSES = ["active", "pending", "investigating"];
    if (statusFilter === "active") {
      result = result.filter(a => ACTIVE_STATUSES.includes((a.status || "pending").toLowerCase()));
    } else if (statusFilter !== "all") {
      result = result.filter(a => (a.status || "pending").toLowerCase() === statusFilter);
    }

    if (driverFilter !== "all") {
      result = result.filter(a => ((a as any).resolvedDriverId || a.driverId) === driverFilter);
    }

    if (customerFilter !== "all") {
      result = result.filter(a => (a as any).customerId === customerFilter);
    }

    if (legalHoldFilter === "active_hold") {
      result = result.filter(a => caseIdsWithActiveHold.has(a.id));
    } else if (legalHoldFilter === "no_hold") {
      result = result.filter(a => !caseIdsWithActiveHold.has(a.id));
    }

    if (dateFrom) {
      const from = parseDateSafe(dateFrom);
      result = result.filter(a => a.accidentDate ? parseDateSafe(a.accidentDate) >= from : false);
    }

    if (dateTo) {
      const to = parseDateSafe(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(a => a.accidentDate ? parseDateSafe(a.accidentDate) <= to : false);
    }

    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "status":
          comparison = (a.status || "pending").localeCompare(b.status || "pending");
          break;
        case "date":
          comparison = (a.accidentDate ? parseDateSafe(a.accidentDate).getTime() : 0) - (b.accidentDate ? parseDateSafe(b.accidentDate).getTime() : 0);
          break;
        case "incidentType":
          comparison = ((a as any).incidentType || "").localeCompare((b as any).incidentType || "");
          break;
        case "customer":
          comparison = getCustomerName((a as any).customerId).localeCompare(getCustomerName((b as any).customerId));
          break;
        case "driver":
          comparison = getDriverName(a.driverId, (a as any).driverName).localeCompare(getDriverName(b.driverId, (b as any).driverName));
          break;
        case "dodAtFault":
          comparison = (a.dodAtFault || "").localeCompare(b.dodAtFault || "");
          break;
        case "actualCost":
          comparison = parseFloat((a as any).actualCost || "0") - parseFloat((b as any).actualCost || "0");
          break;
        case "moveId":
          comparison = (a.redcapId || "").localeCompare(b.redcapId || "");
          break;
        case "probableCost":
          comparison = parseFloat(a.probableCost || "0") - parseFloat(b.probableCost || "0");
          break;
        case "submittedBy":
          const aReporter = (a as any).reporter ? `${(a as any).reporter.firstName || ''} ${(a as any).reporter.lastName || ''}`.trim() : "";
          const bReporter = (b as any).reporter ? `${(b as any).reporter.firstName || ''} ${(b as any).reporter.lastName || ''}`.trim() : "";
          comparison = aReporter.localeCompare(bReporter);
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [accidents, carrierMode, searchTerm, statusFilter, driverFilter, customerFilter, legalHoldFilter, caseIdsWithActiveHold, sortField, sortDirection, drivers, customers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const clearFilters = () => {
    setStatusFilter("active");
    setDriverFilter("all");
    setCustomerFilter("all");
    setLegalHoldFilter("all");
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = statusFilter !== "active" || driverFilter !== "all" || customerFilter !== "all" || legalHoldFilter !== "all" || searchTerm !== "" || dateFrom !== "" || dateTo !== "";

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => handleSort(field)}
      data-testid={`sort-${field}`}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  // ── Widget computed metrics (from accidents data, global — ignores page filters) ──
  const _all = accidents ?? [];
  const _OPEN_S = ["active", "pending", "investigating"];
  const _CUTOFF = new Date("2026-02-09");
  const _openW = _all.filter(a => {
    const s = (a.status ?? "").toLowerCase();
    const d = a.accidentDate ? parseDateSafe(a.accidentDate) : null;
    return _OPEN_S.includes(s) && d !== null && d >= _CUTOFF;
  });
  const _openProbableCost = _openW.reduce((s, a) => s + (parseFloat(a.probableCost as string) || 0), 0);
  const _openMissingCost = _openW.some(a => !a.probableCost && (a.probableCost as any) !== 0);
  const _closedW = _all.filter(a => {
    if (_OPEN_S.includes((a.status ?? "").toLowerCase())) return false;
    const d = a.accidentDate ? parseDateSafe(a.accidentDate) : null;
    return d !== null && d >= _CUTOFF;
  });
  const _getCD = (a: typeof _all[0]): Date | null => {
    if ((a as any).repairCompletionDate) return parseDateSafe((a as any).repairCompletionDate);
    if (a.accidentDate) return parseDateSafe(a.accidentDate);
    return null;
  };
  const _now2 = new Date();
  const _yr = _now2.getFullYear();
  const _mo = _now2.getMonth();
  const _closedYTD = _closedW.filter(a => { const d = _getCD(a); return d && d.getFullYear() === _yr; });
  const _closedMTD = _closedW.filter(a => { const d = _getCD(a); return d && d.getFullYear() === _yr && d.getMonth() === _mo; });
  const _ytdActual = _closedYTD.reduce((s, a) => s + (parseFloat((a as any).finalRepairCost as string) || 0), 0);
  const _ytdProbable = _closedYTD.reduce((s, a) => s + (parseFloat(a.probableCost as string) || 0), 0);
  const _mtdActual = _closedMTD.reduce((s, a) => s + (parseFloat((a as any).finalRepairCost as string) || 0), 0);
  const _mtdProbable = _closedMTD.reduce((s, a) => s + (parseFloat(a.probableCost as string) || 0), 0);
  const _ytdVariance = _ytdActual - _ytdProbable;
  const _mtdVariance = _mtdActual - _mtdProbable;
  const _monthGroups = new Map<string, number[]>();
  _closedW.forEach(a => {
    const d = _getCD(a);
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!_monthGroups.has(k)) _monthGroups.set(k, []);
    _monthGroups.get(k)!.push(parseFloat((a as any).finalRepairCost as string) || 0);
  });
  const _monthAvgs = Array.from(_monthGroups.values()).map(cs => cs.reduce((s, c) => s + c, 0) / cs.length);
  const _avgCostPerMonth = _monthAvgs.length > 0 ? _monthAvgs.reduce((s, v) => s + v, 0) / _monthAvgs.length : 0;
  const _fmtW = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // ── Open the drill-down Sheet for a given widget ──────────────────────────
  const openDrillSheet = (widgetId: SafetyWidgetId) => {
    const _90dAgo = new Date();
    _90dAgo.setDate(_90dAgo.getDate() - 90);
    const dateMs = (a: Accident) => a.accidentDate ? parseDateSafe(a.accidentDate).getTime() : 0;
    const byDateDesc = (a: Accident, b: Accident) => dateMs(b) - dateMs(a);
    const _goLiveClaims = _all
      .filter(a => { const d = a.accidentDate ? parseDateSafe(a.accidentDate) : null; return d && d >= _CUTOFF; })
      .sort(byDateDesc);

    const configMap: Record<SafetyWidgetId, { title: string; description: string; claims: Accident[] }> = {
      "total-claims": {
        title: "Total Claims — Since Go-Live",
        description: "All claims recorded on or after the go-live date (2/9/2026), all statuses.",
        claims: _goLiveClaims,
      },
      "open-claims": {
        title: "Open Claims",
        description: "Active, Pending, or Investigating claims with incident date on or after 2/9/2026.",
        claims: [..._openW].sort(byDateDesc),
      },
      "probable-cost": {
        title: "Open Claims — Probable Cost Detail",
        description: "Open claims since go-live that have a probable repair cost estimate, sorted by exposure.",
        claims: _openW
          .filter(a => parseFloat(a.probableCost as string) > 0)
          .sort((a, b) => (parseFloat(b.probableCost as string) || 0) - (parseFloat(a.probableCost as string) || 0)),
      },
      "closed-vs-probable": {
        title: `Closed Claims — YTD ${_yr} Actual vs Probable`,
        description: `Closed claims in ${_yr} with cost data. Sorted by actual repair cost.`,
        claims: [..._closedYTD].sort((a, b) =>
          (parseFloat((b as any).finalRepairCost as string) || 0) - (parseFloat((a as any).finalRepairCost as string) || 0)
        ),
      },
      "claims-per-1k": {
        title: "Claims — Rolling 90-Day Window",
        description: "All claims in the last 90 days. This is the basis for the Claims / 1k Moves metric.",
        claims: _all
          .filter(a => { const d = a.accidentDate ? parseDateSafe(a.accidentDate) : null; return d && d >= _90dAgo; })
          .sort(byDateDesc),
      },
      "avg-cost-month": {
        title: "Closed Claims — By Month (Since Go-Live)",
        description: "Closed claims since go-live with actual repair cost. Basis for average cost per month calculation.",
        claims: _closedW
          .filter(a => parseFloat((a as any).finalRepairCost as string) > 0)
          .sort(byDateDesc),
      },
    };

    setDrillSheet({ widgetId, ...configMap[widgetId] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Claims</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleCarrier}
                  data-testid="button-carrier-mode-toggle"
                  className={`inline-flex items-center justify-center h-7 w-7 rounded transition-colors ${
                    carrierMode
                      ? "text-primary"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                  aria-pressed={carrierMode}
                  aria-label={carrierMode ? "Carrier mode active — click to show all claims" : "Click to enable carrier claims view"}
                >
                  {carrierMode
                    ? <ShieldCheck className="h-5 w-5" />
                    : <Shield className="h-5 w-5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {carrierMode
                  ? "Carrier Mode: ON — showing carrier claims only"
                  : "All Claims Mode — click to filter by carrier claims"}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground mt-2">
            Track and manage all claims and incidents
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setAddDialogOpen(true)}
            data-testid="button-add-claim"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Claim
          </Button>
          <Link href="/claims/import">
            <Button
              variant="outline"
              data-testid="button-import-claims"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import from Excel
            </Button>
          </Link>
        </div>
      </div>

      {/* Carrier mode active banner */}
      {carrierMode && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary" data-testid="banner-carrier-mode-active">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="font-medium">Carrier Claims View</span>
          <span className="text-primary/70 text-xs">— showing only claims marked for carrier notification</span>
        </div>
      )}

      {/* Claims Dashboard Scorecard */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">Claims Dashboard</span>
        <div className="flex items-center gap-2">
          <Link href="/reports/widget-library">
            <Button variant="outline" size="sm" data-testid="button-widget-library">
              <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
              Widget Library
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={toggleDashboard} data-testid="button-toggle-dashboard">
            {dashboardCollapsed ? "Show Dashboard" : "Hide Dashboard"}
            <ChevronDown className={`ml-1.5 h-4 w-4 transition-transform ${dashboardCollapsed ? "" : "rotate-180"}`} />
          </Button>
        </div>
      </div>
      <div className={dashboardCollapsed ? "hidden" : "space-y-3"}>
        {scorecardLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : scorecardError ? (
        <Card className="border-amber-500/50 bg-amber-50/10">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Unable to load dashboard metrics. Showing claims list only.</span>
            </div>
          </CardContent>
        </Card>
      ) : scorecard ? (
        <>
          {/* Row 1: KPI Widget Bar — drag handle to reorder, click to drill down */}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleWidgetDragEnd}>
            <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {widgetOrder.map((id) => {
                  if (id === "total-claims") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-golive-mtd"
                        onClick={() => openDrillSheet("total-claims")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Total Claims</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Total Claims — Since Go-Live / MTD</p><p>All claims recorded since go-live start date (2/9/2026).</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-end gap-3">
                            <div>
                              <div className="text-4xl font-bold tracking-tight leading-none">{scorecard.goLiveSummary.claimsSinceGoLive}</div>
                              <div className="text-xs text-muted-foreground mt-1">Since Go-Live</div>
                            </div>
                            <div className="w-px h-9 bg-border shrink-0 mb-4" />
                            <div>
                              <div className="text-4xl font-bold tracking-tight leading-none">{scorecard.goLiveSummary.claimsMtd}</div>
                              <div className="text-xs text-muted-foreground mt-1">MTD</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  if (id === "open-claims") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-open-claims"
                        onClick={() => openDrillSheet("open-claims")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileWarning className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Open Claims</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Open Claims</p><p>Active, Pending, or Investigating — Incident Date on or after 2/9/2026. Click to filter the claims list below.</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="text-4xl font-bold tracking-tight leading-none text-destructive">{_openW.length}</div>
                          <div className="text-xs text-muted-foreground mt-1">Active · Pending · Investigating</div>
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  if (id === "probable-cost") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-open-probable-cost"
                        onClick={() => openDrillSheet("probable-cost")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Open Probable Cost</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Open Claims Probable Cost</p><p>Sum of probable cost for open claims on or after 2/9/2026. Click to filter the claims list below.</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="text-4xl font-bold tracking-tight leading-none text-destructive" data-testid="metric-open-probable-cost">{_fmtW(_openProbableCost)}</div>
                          {_openMissingCost
                            ? <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Some claims missing probable cost</p>
                            : <p className="text-xs text-muted-foreground mt-1">Open claims exposure</p>
                          }
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  if (id === "closed-vs-probable") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-closed-actual-vs-probable"
                        onClick={() => openDrillSheet("closed-vs-probable")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Closed: Actual vs Probable</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Closed Claims: Actual vs Probable</p><p>Variance = Actual − Probable. Click to view detail.</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">YTD {_yr}</div>
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-2xl font-bold tracking-tight leading-none" data-testid="metric-ytd-actual-safety">{_fmtW(_ytdActual)}</span>
                                <span className="text-xs text-muted-foreground">actual</span>
                                {_ytdVariance !== 0 && <span className={`text-xs font-semibold ${_ytdVariance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>{_ytdVariance > 0 ? "▲" : "▼"}{_fmtW(Math.abs(_ytdVariance))}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">{_fmtW(_ytdProbable)} probable</div>
                            </div>
                            <div className="border-t border-border pt-2">
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">MTD</div>
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-2xl font-bold tracking-tight leading-none" data-testid="metric-mtd-actual-safety">{_fmtW(_mtdActual)}</span>
                                <span className="text-xs text-muted-foreground">actual</span>
                                {_mtdVariance !== 0 && <span className={`text-xs font-semibold ${_mtdVariance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>{_mtdVariance > 0 ? "▲" : "▼"}{_fmtW(Math.abs(_mtdVariance))}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">{_fmtW(_mtdProbable)} probable</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  if (id === "claims-per-1k") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-claims-per-1k"
                        onClick={() => openDrillSheet("claims-per-1k")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Claims / 1k Moves</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Claims / 1,000 Moves</p><p>Rolling 90-day window. Click to view underlying claims.</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-4xl font-bold tracking-tight leading-none">{scorecard.driverScorecard.claimsPer1k90Days}</span>
                            {scorecard.driverScorecard.claimsPer1k90Days > scorecard.thresholds.claimsPer1kWarning && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">30d: {scorecard.driverScorecard.claimsPer1k30Days}</div>
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  if (id === "avg-cost-month") return (
                    <SortableWidget key={id} id={id}>
                      <Card className="hover-elevate cursor-pointer h-full" data-testid="card-avg-cost-per-month"
                        onClick={() => openDrillSheet("avg-cost-month")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-muted-foreground leading-tight">Avg Cost / Month</span>
                            </div>
                            <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0 mt-0.5" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1"><p className="font-semibold">Average Cost per Month</p><p>Average actual repair cost per calendar month across all months. Click to view closed claims.</p></TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="text-4xl font-bold tracking-tight leading-none" data-testid="metric-avg-cost-per-month-safety">
                            {_avgCostPerMonth > 0 ? _fmtW(_avgCostPerMonth) : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Across {_monthGroups.size} month{_monthGroups.size !== 1 ? "s" : ""}</div>
                        </CardContent>
                      </Card>
                    </SortableWidget>
                  );
                  return null;
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* Row 2: Risk Signals, Evidence, Patterns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Risk Signals Card */}
            <Card data-testid="card-risk-signals">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Risk Signals
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center cursor-help">
                        <div className="text-lg font-bold">{scorecard.riskSignals.highRiskMoveCount}</div>
                        <div className="text-[10px] text-muted-foreground">High-Risk Moves</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Moves with risk score ≥35 (tenure &lt;60d, after-hours, urban, high-value)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center cursor-help">
                        <div className="text-lg font-bold">{scorecard.riskSignals.claimsFromHighRiskPercent}%</div>
                        <div className="text-[10px] text-muted-foreground">Claims from HR</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>% of claims from high-risk moves</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center cursor-help">
                        <div className={`text-lg font-bold ${scorecard.riskSignals.avgRiskScore > scorecard.thresholds.riskScoreWarning ? 'text-amber-500' : ''}`}>
                          {scorecard.riskSignals.avgRiskScore}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Avg Risk Score</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Average move risk score (0-100)</TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground text-center">
                  Based on {scorecard.riskSignals.totalMoves90Days} moves (90d)
                </div>
              </CardContent>
            </Card>

            {/* Evidence Compliance Card */}
            <Card data-testid="card-evidence">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Camera className="h-4 w-4 text-blue-500" />
                  Photo & Evidence Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {/* Move Photo Compliance Row */}
                <div className="space-y-2">
                  <div className="text-[10px] text-muted-foreground font-medium">Move Photos (90d)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-center p-1.5 rounded bg-muted/30">
                          <div className={`text-sm font-bold ${scorecard.evidenceCompliance.pickupCompliancePercent >= 80 ? 'text-green-500' : scorecard.evidenceCompliance.pickupCompliancePercent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {scorecard.evidenceCompliance.pickupCompliancePercent}%
                          </div>
                          <div className="text-[9px] text-muted-foreground">Pickup</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>% of moves with complete pickup photos</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-center p-1.5 rounded bg-muted/30">
                          <div className={`text-sm font-bold ${scorecard.evidenceCompliance.dropoffCompliancePercent >= 80 ? 'text-green-500' : scorecard.evidenceCompliance.dropoffCompliancePercent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {scorecard.evidenceCompliance.dropoffCompliancePercent}%
                          </div>
                          <div className="text-[9px] text-muted-foreground">Dropoff</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>% of moves with complete dropoff photos</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-center p-1.5 rounded bg-muted/30">
                          <div className={`text-sm font-bold ${scorecard.evidenceCompliance.fullCompliancePercent >= 80 ? 'text-green-500' : scorecard.evidenceCompliance.fullCompliancePercent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {scorecard.evidenceCompliance.fullCompliancePercent}%
                          </div>
                          <div className="text-[9px] text-muted-foreground">Both</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>% of moves with complete pickup AND dropoff photos</TooltipContent>
                    </Tooltip>
                  </div>
                  
                  {/* Claims Evidence Row */}
                  <div className="text-[10px] text-muted-foreground font-medium pt-1">Claims Evidence</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-1.5 rounded bg-muted/30">
                      <div className={`text-sm font-bold ${scorecard.evidenceCompliance.claimsWithFullEvidencePercent >= 80 ? 'text-green-500' : scorecard.evidenceCompliance.claimsWithFullEvidencePercent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {scorecard.evidenceCompliance.claimsWithFullEvidence}
                      </div>
                      <div className="text-[9px] text-muted-foreground">With Evidence</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-muted/30">
                      <div className="text-sm font-bold text-amber-500">
                        {scorecard.evidenceCompliance.claimsWithPartialEvidence}
                      </div>
                      <div className="text-[9px] text-muted-foreground">Partial</div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-center p-1.5 rounded bg-muted/30 cursor-pointer hover-elevate">
                          <div className={`text-sm font-bold ${scorecard.evidenceCompliance.claimsMissingPhotos > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {scorecard.evidenceCompliance.claimsMissingPhotos}
                          </div>
                          <div className="text-[9px] text-muted-foreground">Missing</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Claims with no photo evidence</TooltipContent>
                    </Tooltip>
                  </div>
                  
                  {/* Success Rate Comparison */}
                  {(scorecard.evidenceCompliance.successRateWithEvidence !== null || scorecard.evidenceCompliance.successRateWithoutEvidence !== null) && (
                    <>
                      <div className="text-[10px] text-muted-foreground font-medium pt-1">Favorable Outcome Rate</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center p-1.5 rounded bg-green-500/10 border border-green-500/20">
                          <div className="text-sm font-bold text-green-600 dark:text-green-400">
                            {scorecard.evidenceCompliance.successRateWithEvidence !== null ? `${scorecard.evidenceCompliance.successRateWithEvidence}%` : 'N/A'}
                          </div>
                          <div className="text-[9px] text-muted-foreground">With Photos</div>
                        </div>
                        <div className="text-center p-1.5 rounded bg-red-500/10 border border-red-500/20">
                          <div className="text-sm font-bold text-red-600 dark:text-red-400">
                            {scorecard.evidenceCompliance.successRateWithoutEvidence !== null ? `${scorecard.evidenceCompliance.successRateWithoutEvidence}%` : 'N/A'}
                          </div>
                          <div className="text-[9px] text-muted-foreground">Without Photos</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground text-center">
                  Based on {scorecard.evidenceCompliance.totalMoves90Days} moves, {scorecard.evidenceCompliance.totalClaims} claims
                </div>
              </CardContent>
            </Card>

            {/* Loss Patterns Card */}
            <Card data-testid="card-loss-patterns">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-purple-500" />
                  Loss Patterns
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1.5">
                  {/* Top locations */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Top Location:</span>
                    <span className="font-medium capitalize truncate max-w-[120px]">
                      {scorecard.lossPatterns.topLocations[0]?.location || 'N/A'} ({scorecard.lossPatterns.topLocations[0]?.count || 0})
                    </span>
                  </div>
                  {/* Top driver */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Top Driver:</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={scorecard.lossPatterns.topDriversBySeverity[0]?.driverId ? `/drivers/${scorecard.lossPatterns.topDriversBySeverity[0].driverId}` : '#'}>
                          <span className="font-medium text-primary truncate max-w-[120px] cursor-pointer hover:underline">
                            {scorecard.lossPatterns.topDriversBySeverity[0]?.name || 'N/A'}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>
                        {scorecard.lossPatterns.topDriversBySeverity[0]?.claimCount || 0} claims, severity score: {scorecard.lossPatterns.topDriversBySeverity[0]?.score || 0}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Peak time */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Peak Time:</span>
                    <span className="font-medium capitalize">
                      {scorecard.lossPatterns.peakTimeWindow} ({scorecard.lossPatterns.peakTimePercent}%)
                    </span>
                  </div>
                  {/* Repeat drivers */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Repeat Drivers:</span>
                    <span className={`font-medium ${scorecard.driverScorecard.repeatIncidentDriverCount > scorecard.thresholds.repeatDriverWarning ? 'text-red-500' : ''}`}>
                      {scorecard.driverScorecard.repeatIncidentDriverCount}
                    </span>
                  </div>
                  {/* Preventable % */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Preventable:</span>
                    <span className={`font-medium ${scorecard.driverScorecard.preventablePercent > scorecard.thresholds.preventableWarning ? 'text-red-500' : ''}`}>
                      {scorecard.driverScorecard.preventablePercent}% ({scorecard.driverScorecard.preventableCount})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
      </div>

      <div ref={claimsListRef} className="scroll-mt-4">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative w-full sm:w-[25ch] sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search claims..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-claims"
                />
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4 mr-1.5" />
                Clear Filters
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filter-status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Open)</SelectItem>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {VALID_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Driver</label>
                <Select value={driverFilter} onValueChange={setDriverFilter}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filter-driver">
                    <SelectValue placeholder="All Drivers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Drivers</SelectItem>
                    {uniqueDriversInClaims.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Account</label>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filter-account">
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {uniqueCustomersInClaims.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Legal Hold</label>
                <Select value={legalHoldFilter} onValueChange={v => setLegalHoldFilter(v as "all" | "active_hold" | "no_hold")}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filter-legal-hold">
                    <SelectValue placeholder="All Claims" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Claims</SelectItem>
                    <SelectItem value="active_hold">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                        Active Holds
                      </div>
                    </SelectItem>
                    <SelectItem value="no_hold">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        No Hold
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 lg:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Incident Date Range</label>
                <div className="flex items-center gap-1.5">
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-28 justify-start text-left font-normal px-2"
                        data-testid="filter-date-from"
                      >
                        <CalendarIcon className="h-3 w-3 mr-1.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs truncate">
                          {dateFrom
                            ? new Date(dateFrom + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
                            : <span className="text-muted-foreground">From</span>}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom ? new Date(dateFrom + "T12:00:00") : undefined}
                        onSelect={(d) => {
                          if (d) {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            setDateFrom(`${y}-${m}-${day}`);
                          } else {
                            setDateFrom("");
                          }
                          setDateFromOpen(false);
                        }}
                        initialFocus
                      />
                      {dateFrom && (
                        <div className="border-t p-2">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => { setDateFrom(""); setDateFromOpen(false); }}>
                            Clear
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  <span className="text-xs text-muted-foreground shrink-0">–</span>

                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-28 justify-start text-left font-normal px-2"
                        data-testid="filter-date-to"
                      >
                        <CalendarIcon className="h-3 w-3 mr-1.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs truncate">
                          {dateTo
                            ? new Date(dateTo + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
                            : <span className="text-muted-foreground">To</span>}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo ? new Date(dateTo + "T12:00:00") : undefined}
                        onSelect={(d) => {
                          if (d) {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            setDateTo(`${y}-${m}-${day}`);
                          } else {
                            setDateTo("");
                          }
                          setDateToOpen(false);
                        }}
                        initialFocus
                      />
                      {dateTo && (
                        <div className="border-t p-2">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => { setDateTo(""); setDateToOpen(false); }}>
                            Clear
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Showing {filteredAndSortedAccidents.length} of {accidents?.length || 0} claims
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredAndSortedAccidents.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">
                        <SortableHeader field="status">Status</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <SortableHeader field="date">Incident Date</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[130px]">
                        <SortableHeader field="incidentType">Incident Type</SortableHeader>
                      </TableHead>
                      <TableHead>
                        <SortableHeader field="customer">Account</SortableHeader>
                      </TableHead>
                      <TableHead>
                        <SortableHeader field="driver">Driver</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[110px]">
                        <SortableHeader field="dodAtFault">DoD At Fault</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[100px]">
                        <SortableHeader field="moveId">Move ID</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <SortableHeader field="probableCost">Probable Cost</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <SortableHeader field="actualCost">Actual Cost</SortableHeader>
                      </TableHead>
                      <TableHead className="w-[140px]">
                        <SortableHeader field="submittedBy">Incident Submitted By</SortableHeader>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedAccidents.map((accident) => (
                      <TableRow 
                        key={accident.id} 
                        className={`cursor-pointer hover:bg-muted/50 ${
                          highlightedClaimId === accident.id
                            ? "border-l-4 border-l-green-500 dark:border-l-green-400 bg-green-50 dark:bg-green-950/30 claim-highlight-fade"
                            : ""
                        }`}
                        data-testid={`row-accident-${accident.id}`}
                      >
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            <StatusBadge
                              status={accident.status}
                              data-testid={`badge-status-${accident.id}`}
                            />
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            <span className="font-medium">{formatDate(accident.accidentDate)}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            {(accident as any).incidentType || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            {getCustomerName((accident as any).customerId) || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const resolvedId: string | null = (accident as any).resolvedDriverId || accident.driverId;
                            const name = getDriverName(accident.driverId, (accident as any).driverName);
                            if (resolvedId && name !== "Unassigned") {
                              return (
                                <Link href={`/drivers/${resolvedId}`}>
                                  <span className="text-primary hover:underline cursor-pointer font-medium">{name}</span>
                                </Link>
                              );
                            }
                            return <span className="text-muted-foreground">Unassigned</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            {accident.dodAtFault ? accident.dodAtFault.charAt(0).toUpperCase() + accident.dodAtFault.slice(1) : "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            {accident.redcapId || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            <span className="font-medium">{formatCurrency(accident.probableCost)}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            <span className="font-medium">
                              {(accident as any).actualCost
                                ? formatCurrency((accident as any).actualCost)
                                : "—"}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/accidents/${accident.id}`} className="block">
                            {(accident as any).reporter 
                              ? `${(accident as any).reporter.firstName || ''} ${(accident as any).reporter.lastName || ''}`.trim() || "—"
                              : "—"}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {accidents && accidents.length > 0 
                    ? "No claims match your filters. Try adjusting your search or filters."
                    : "No claims recorded yet. Click \"Add Claim\" to create one."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      <AddClaimDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={(newId) => {
          setSortField('date');
          setSortDirection('desc');
          setStatusFilter('active');
          setSearchTerm('');
          if (newId) {
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightedClaimId(newId);
            highlightTimeoutRef.current = setTimeout(() => {
              setHighlightedClaimId(null);
              highlightTimeoutRef.current = null;
            }, 4000);
          }
        }}
      />

      {/* ── Widget Drill-Down Sheet ──────────────────────────────────────── */}
      <Sheet open={!!drillSheet} onOpenChange={(o) => { if (!o) setDrillSheet(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-md shrink-0">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base leading-tight">{drillSheet?.title}</SheetTitle>
                <SheetDescription className="text-xs mt-0.5 leading-snug">{drillSheet?.description}</SheetDescription>
              </div>
            </div>
            {drillSheet && (
              <p className="text-xs text-muted-foreground pt-1">
                {drillSheet.claims.length} claim{drillSheet.claims.length !== 1 ? "s" : ""}
              </p>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {drillSheet && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Driver</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Incident Type</TableHead>
                      <TableHead className="text-xs text-right">Probable $</TableHead>
                      <TableHead className="text-xs text-right">Actual $</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillSheet.claims.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                          No claims found for this filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      drillSheet.claims.map((c) => {
                        const customerObj = customers.find(cu => cu.id === c.customerId);
                        return (
                          <TableRow key={c.id} data-testid={`row-drill-claim-${c.id}`}>
                            <TableCell className="text-sm whitespace-nowrap py-2">
                              {formatDate(c.accidentDate)}
                            </TableCell>
                            <TableCell className="text-sm py-2">
                              {getDriverName(c.driverId)}
                            </TableCell>
                            <TableCell className="text-sm py-2">
                              {customerObj?.customerName ?? "—"}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant="outline" className="text-xs capitalize">
                                {c.status?.replace(/_/g, " ") ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm py-2 text-muted-foreground">
                              {c.incidentType ? c.incidentType.replace(/_/g, " ") : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium py-2">
                              {c.probableCost ? formatCurrency(c.probableCost) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium py-2">
                              {(c as any).finalRepairCost ? formatCurrency((c as any).finalRepairCost) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {drillSheet ? `${drillSheet.claims.length} record${drillSheet.claims.length !== 1 ? "s" : ""}` : ""}
            </p>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                if (drillSheet) {
                  const statusMap: Record<SafetyWidgetId, string> = {
                    "total-claims": "all",
                    "open-claims": "active",
                    "probable-cost": "active",
                    "closed-vs-probable": "closed",
                    "claims-per-1k": "all",
                    "avg-cost-month": "closed",
                  };
                  drillIntoList(statusMap[drillSheet.widgetId], "2026-02-09");
                  setDrillSheet(null);
                }
              }}
              data-testid="button-drill-view-in-list"
            >
              View in Claims List
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
