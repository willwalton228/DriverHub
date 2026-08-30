import { useState, useEffect, useCallback, useMemo } from "react";
import { parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ClaimsWidgetLibrary, type ClaimsWidgetId, CLAIMS_WIDGET_IDS } from "@/components/claims/ClaimsWidgetLibrary";
import { useCarrierMode } from "@/hooks/useCarrierMode";
import { useToast } from "@/hooks/use-toast";
import type { Accident, DriverWithUser } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, FileText, DollarSign, Loader2, Clock, CheckCircle, XCircle, ShieldAlert, Shield, ShieldCheck, TrendingDown, TrendingUp, Plus, ArrowUpRight, Lock, Scale, MailWarning, Ambulance, FlaskConical, FileUp, MapPin, Building2, User, BarChart3, Info, GripVertical, LayoutDashboard, ListChecks } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDate } from "@/lib/dateFormat";
import { EmailSummaryDialog } from "@/components/EmailSummaryDialog";
import { ClaimStatusBadge } from "@/components/ClaimStatusBadge";
import { CandidateSummaryPanel } from "@/components/recruiting/CandidateSummaryPanel";
import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";
import { ClaimAlertsSummaryCard } from "@/components/claims/ClaimAlertsPanel";

interface LossImpactSummary {
  marketLossScore: number;
  driverLossScoreAvg: number;
  highRiskDriverCount: number;
  totalAtFaultClaims: number;
  totalClaimsCost: number;
  claimsPer100Drivers: number;
  inputs?: {
    openClaimsCount: number;
    totalReserveDollars: number;
    lateMovePercent: number;
    driverIncidentRate: number;
  };
}

interface LossImpactAPIResponse {
  marketLossScore: number;
  driverLossScore: number;
  highRiskDriverCount: number;
  atFaultClaimsCount: number;
  totalCostsCents: number;
  claimsPer100Drivers: number;
  inputs?: {
    openClaimsCount: number;
    totalReserveDollars: number;
    lateMovePercent: number;
    driverIncidentRate: number;
  };
}

interface VolumeStats {
  totalMovesAllTime: number;
  totalMoves30d: number;
}

interface AnalyticsRow {
  groupLabel: string;
  groupKey: string | null;
  totalClaims: number;
  preventableClaims: number;
  nonPreventableClaims: number;
  estimatedDamageTotal: number;
  actualDamagePaid: number;
  preventableRate: number;
  avgClaimCost: number;
}

interface ClaimsAnalytics {
  byMarket: AnalyticsRow[];
  byLocation: AnalyticsRow[];
  byCustomer: AnalyticsRow[];
  byDriver: AnalyticsRow[];
}

const fmt$ = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

function PreventabilityBadge({ rate }: { rate: number }) {
  if (rate >= 60) return <Badge variant="destructive">{rate}%</Badge>;
  if (rate >= 30) return <Badge className="bg-amber-500">{rate}%</Badge>;
  return <Badge variant="secondary">{rate}%</Badge>;
}

function AnalyticsTable({
  rows,
  emptyMessage,
  linkPrefix,
}: {
  rows: AnalyticsRow[];
  emptyMessage: string;
  linkPrefix?: string;
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%] min-w-[160px]">Name</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Preventable</TableHead>
          <TableHead className="text-right">Prev. Rate</TableHead>
          <TableHead className="text-right">Estimated Damage</TableHead>
          <TableHead className="text-right">Actual Paid</TableHead>
          <TableHead className="text-right">Avg Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={row.groupKey ?? i} data-testid={`analytics-row-${i}`}>
            <TableCell className="font-medium">
              {linkPrefix && row.groupKey ? (
                <Link href={`${linkPrefix}/${row.groupKey}`}>
                  <span className="text-primary hover:underline cursor-pointer">{row.groupLabel}</span>
                </Link>
              ) : (
                row.groupLabel
              )}
            </TableCell>
            <TableCell className="text-right font-bold">{row.totalClaims}</TableCell>
            <TableCell className="text-right text-destructive">{row.preventableClaims}</TableCell>
            <TableCell className="text-right">
              <PreventabilityBadge rate={row.preventableRate} />
            </TableCell>
            <TableCell className="text-right">{fmt$(row.estimatedDamageTotal)}</TableCell>
            <TableCell className="text-right">{fmt$(row.actualDamagePaid)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{fmt$(row.avgClaimCost)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

const WIDGET_IDS = CLAIMS_WIDGET_IDS;
type WidgetId = ClaimsWidgetId;

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

export default function ClaimsDashboard() {
  const { isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const { carrierMode, toggleCarrierMode } = useCarrierMode();
  const [activeTab, setActiveTab] = useState("overview");

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

  // Widget order + visibility — persisted server-side per user
  const queryClient = useQueryClient();
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...WIDGET_IDS]);
  const [hiddenWidgets, setHiddenWidgets] = useState<WidgetId[]>([]);

  const { data: widgetPrefs } = useQuery<{ widgetOrder: string[]; hiddenWidgets: string[] }>({
    queryKey: ["/api/layout/claims-kpi"],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!widgetPrefs) return;
    const validOrder = widgetPrefs.widgetOrder.filter((id): id is WidgetId =>
      (WIDGET_IDS as readonly string[]).includes(id)
    );
    const missing = ([...WIDGET_IDS] as WidgetId[]).filter(id => !validOrder.includes(id));
    setWidgetOrder([...validOrder, ...missing]);
    setHiddenWidgets(
      widgetPrefs.hiddenWidgets.filter((id): id is WidgetId =>
        (WIDGET_IDS as readonly string[]).includes(id)
      )
    );
  }, [widgetPrefs]);

  const saveWidgetPrefs = useMutation({
    mutationFn: async (prefs: { widgetOrder?: WidgetId[]; hiddenWidgets?: WidgetId[] }) => {
      await apiRequest("PUT", "/api/layout/claims-kpi", prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout/claims-kpi"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setWidgetOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as WidgetId);
        const newIdx = prev.indexOf(over.id as WidgetId);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(prev, oldIdx, newIdx);
        saveWidgetPrefs.mutate({ widgetOrder: next });
        return next;
      });
    },
    [saveWidgetPrefs],
  );

  const handleWidgetToggle = useCallback(
    (id: WidgetId) => {
      setHiddenWidgets((prev) => {
        const next = prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id];
        saveWidgetPrefs.mutate({ hiddenWidgets: next });
        return next;
      });
    },
    [saveWidgetPrefs],
  );

  const handleWidgetReorder = useCallback(
    (newOrder: WidgetId[]) => {
      setWidgetOrder(newOrder);
      saveWidgetPrefs.mutate({ widgetOrder: newOrder });
    },
    [saveWidgetPrefs],
  );

  const { data: rawAccidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const accidents = useMemo(
    () => carrierMode
      ? rawAccidents.filter((a) => (a as any).carrierNotificationRequired === true)
      : rawAccidents,
    [rawAccidents, carrierMode],
  );

  const { data: drivers = [] } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const { data: lossImpactData } = useQuery<LossImpactAPIResponse>({
    queryKey: ["/api/claims/loss-impact-summary"],
  });

  interface RecoveryMetrics {
    totalRecoveredAmount: number;
    percentClaimsWithRecoveryPursued: number;
    claimsWithRecoveryPursued: number;
    totalClaims: number;
    grossClaimsCost: number;
    netClaimsCost: number;
    recoveryRate: number;
  }

  const { data: recoveryMetrics } = useQuery<RecoveryMetrics>({
    queryKey: ["/api/claims/dashboard/recovery-metrics"],
  });

  interface LitigationHoldMetrics {
    activeHoldsCount: number;
    severeClaimsCount: number;
    injuryClaimsCount: number;
    attorneyLetterClaimsCount: number;
    totalClaims: number;
  }

  const { data: litigationMetrics } = useQuery<LitigationHoldMetrics>({
    queryKey: ["/api/claims/dashboard/litigation-holds"],
  });

  interface DrugTestMetrics {
    totalRequired: number;
    pendingCount: number;
    overdueCount: number;
    completedCount: number;
    waivedCount: number;
    acknowledgedCount: number;
    complianceRate: number;
  }

  const { data: drugTestMetrics } = useQuery<DrugTestMetrics>({
    queryKey: ["/api/claims/dashboard/drug-test-metrics"],
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<ClaimsAnalytics>({
    queryKey: ["/api/claims/analytics"],
    enabled: activeTab === "analytics",
  });

  const { data: volumeStats } = useQuery<VolumeStats>({
    queryKey: ["/api/claims/volume-stats"],
  });

  // Claims / 1k Moves computations
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const claims30d = accidents.filter((a) => {
    const d = a.accidentDate ? parseDateSafe(a.accidentDate) : null;
    return d !== null && d >= thirtyDaysAgo;
  });
  const totalMovesAllTime = volumeStats?.totalMovesAllTime ?? 0;
  const totalMoves30d = volumeStats?.totalMoves30d ?? 0;
  const claimsPer1kMoves =
    totalMovesAllTime > 0
      ? Math.round((accidents.length / totalMovesAllTime) * 1000 * 10) / 10
      : null;

  const OPEN_CLAIMS_CUTOFF = new Date("2026-02-09");
  const openClaims = accidents.filter((a) => {
    const statusMatch = ["active", "pending", "investigating"].includes((a.status ?? "").toLowerCase());
    const dateVal = a.accidentDate ? parseDateSafe(a.accidentDate) : null;
    const dateMatch = dateVal !== null && dateVal >= OPEN_CLAIMS_CUTOFF;
    return statusMatch && dateMatch;
  });
  const openClaimsProbableCost = openClaims.reduce(
    (sum, a) => sum + (parseFloat(a.probableCost as string) || 0),
    0,
  );
  const openClaimsMissingCost = openClaims.some(
    (a) => a.probableCost === null || a.probableCost === undefined || a.probableCost === ("" as any),
  );
  const investigatingClaims = accidents.filter((a) => a.status === "investigating");
  const resolvedClaims = accidents.filter((a) => a.status === "resolved");
  const closedClaims = accidents.filter((a) => a.status === "closed");

  // Closed Claims Actual vs Probable Cost widget
  const OPEN_STATUSES = ["active", "pending", "investigating"];
  const closedClaimsAll = accidents.filter(
    (a) => !OPEN_STATUSES.includes((a.status ?? "").toLowerCase()),
  );
  const getClosedDate = (a: (typeof accidents)[0]): Date | null => {
    if (a.repairCompletionDate) return parseDateSafe(a.repairCompletionDate);
    if (a.accidentDate) return parseDateSafe(a.accidentDate);
    return null;
  };
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const closedClaimsYTD = closedClaimsAll.filter((a) => {
    const d = getClosedDate(a);
    return d !== null && d.getFullYear() === currentYear;
  });
  const closedClaimsMTD = closedClaimsAll.filter((a) => {
    const d = getClosedDate(a);
    return d !== null && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  const closedYTDActual = closedClaimsYTD.reduce(
    (s, a) => s + (parseFloat(a.finalRepairCost as string) || 0), 0,
  );
  const closedYTDProbable = closedClaimsYTD.reduce(
    (s, a) => s + (parseFloat(a.probableCost as string) || 0), 0,
  );
  const closedMTDActual = closedClaimsMTD.reduce(
    (s, a) => s + (parseFloat(a.finalRepairCost as string) || 0), 0,
  );
  const closedMTDProbable = closedClaimsMTD.reduce(
    (s, a) => s + (parseFloat(a.probableCost as string) || 0), 0,
  );
  const closedYTDVariance = closedYTDActual - closedYTDProbable;
  const closedMTDVariance = closedMTDActual - closedMTDProbable;

  // Average Cost per Month widget
  // Step 1: group closed claims by year-month, compute each month's average final_repair_cost
  // Step 2: average those monthly averages
  const monthlyRepairGroups = new Map<string, number[]>();
  closedClaimsAll.forEach((a) => {
    const d = getClosedDate(a);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!monthlyRepairGroups.has(key)) monthlyRepairGroups.set(key, []);
    monthlyRepairGroups.get(key)!.push(parseFloat(a.finalRepairCost as string) || 0);
  });
  const monthlyRepairAvgs = Array.from(monthlyRepairGroups.values()).map(
    (costs) => costs.reduce((s, c) => s + c, 0) / costs.length,
  );
  const avgCostPerMonth =
    monthlyRepairAvgs.length > 0
      ? monthlyRepairAvgs.reduce((s, v) => s + v, 0) / monthlyRepairAvgs.length
      : 0;

  const atFaultClaims = accidents.filter((a) => a.dodAtFault === "yes" || a.dodAtFault === "Yes");
  const notAtFaultClaims = accidents.filter((a) => a.dodAtFault === "no" || a.dodAtFault === "No");
  const pendingFaultClaims = accidents.filter((a) => a.dodAtFault === "pending" || a.dodAtFault === "Pending" || !a.dodAtFault);

  const totalProbableCost = accidents.reduce((sum, a) => sum + (parseFloat(a.probableCost as string) || 0), 0);
  const totalActualCost = accidents.reduce((sum, a) => sum + (parseFloat(a.actualCost as string) || 0), 0);

  const lossImpact: LossImpactSummary = lossImpactData ? {
    marketLossScore: lossImpactData.marketLossScore,
    driverLossScoreAvg: lossImpactData.driverLossScore,
    highRiskDriverCount: lossImpactData.highRiskDriverCount,
    totalAtFaultClaims: lossImpactData.atFaultClaimsCount,
    totalClaimsCost: lossImpactData.totalCostsCents / 100,
    claimsPer100Drivers: lossImpactData.claimsPer100Drivers,
    inputs: lossImpactData.inputs,
  } : {
    marketLossScore: Math.min(100, Math.round((atFaultClaims.length / Math.max(1, drivers.length)) * 100)),
    driverLossScoreAvg: Math.round(atFaultClaims.length > 0 ? (atFaultClaims.length / Math.max(1, new Set(atFaultClaims.map(a => a.driverId)).size)) * 15 : 0),
    highRiskDriverCount: new Set(atFaultClaims.filter(a => {
      const driverClaims = atFaultClaims.filter(c => c.driverId === a.driverId).length;
      return driverClaims >= 2;
    }).map(a => a.driverId)).size,
    totalAtFaultClaims: atFaultClaims.length,
    totalClaimsCost: totalActualCost + totalProbableCost,
    claimsPer100Drivers: drivers.length > 0 ? Math.round((accidents.length / drivers.length) * 100) : 0,
  };

  const recentClaims = [...accidents]
    .sort((a, b) => (b.accidentDate ? parseDateSafe(b.accidentDate).getTime() : 0) - (a.accidentDate ? parseDateSafe(a.accidentDate).getTime() : 0))
    .slice(0, 5);

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "Unknown";
    const driver = drivers.find((d) => d.id === driverId);
    return driver ? `${driver.user?.firstName} ${driver.user?.lastName}` : "Unknown";
  };

  const summaryContent = `
CLAIMS SUMMARY
Total Claims: ${accidents.length}
Open: ${openClaims.length}
Investigating: ${investigatingClaims.length}
Resolved: ${resolvedClaims.length}
Closed: ${closedClaims.length}

FAULT ANALYSIS:
At Fault: ${atFaultClaims.length}
Not At Fault: ${notAtFaultClaims.length}
Pending Determination: ${pendingFaultClaims.length}

COST SUMMARY:
Total Probable Cost: $${totalProbableCost.toFixed(2)}
Total Actual Cost: $${totalActualCost.toFixed(2)}

RECENT CLAIMS:
${recentClaims.map((c, i) => `${i + 1}. ${formatDate(c.accidentDate)} - ${getDriverName(c.driverId)} (${c.status})`).join("\n")}
  `.trim();


  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Claims Dashboard</h1>
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
                  aria-label={carrierMode ? "Carrier mode active" : "Enable carrier mode"}
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
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/claims">
              <Button variant="outline" size="sm" data-testid="button-claims-list">
                <ListChecks className="h-4 w-4 mr-2" />
                List
              </Button>
            </Link>
            <Button variant="outline" size="sm" data-testid="button-widget-library-claims" onClick={() => setWidgetLibraryOpen(true)}>
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Widget Library
            </Button>
            {isSuperAdmin && (
              <Link href="/imports/claims">
                <Button variant="outline" size="sm" data-testid="button-import-claims">
                  <FileUp className="h-4 w-4 mr-2" />
                  Import Claims
                </Button>
              </Link>
            )}
            <Link href="/claims/new">
              <Button size="sm" data-testid="button-new-claim">
                <Plus className="h-4 w-4 mr-2" />
                New Claim
              </Button>
            </Link>
            <EmailSummaryDialog title="Claims" summaryContent={summaryContent} />
          </div>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of all claims and incident metrics
        </p>
      </div>

      {/* Carrier mode active banner */}
      {carrierMode && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary" data-testid="banner-carrier-mode-active">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="font-medium">Carrier Claims View</span>
          <span className="text-primary/70 text-xs">— all metrics below reflect carrier claims only</span>
        </div>
      )}

      <ModuleDashboard moduleKey="claims" title="Claims Insights" />

      {/* Summary KPI bar — draggable, order persists per user */}
      {(() => {
        const claimsPer1kMoves30d =
          totalMoves30d > 0
            ? Math.round((claims30d.length / totalMoves30d) * 1000 * 10) / 10
            : null;

        const widgetMap: Record<WidgetId, React.ReactNode> = {
          "total-claims": (
            <SortableWidget key="total-claims" id="total-claims">
              <Link href="/claims?status=all&from=claims-dashboard">
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-[15px] font-semibold text-foreground truncate">Total Claims</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" onClick={(e) => e.preventDefault()} />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                          <p className="font-semibold">Total Claims — Since Go-Live / MTD</p>
                          <p>All claims in the system regardless of status or date. Includes every incident recorded since go-live.</p>
                          <p className="text-muted-foreground">Date basis: Incident Date. No status filter applied. Global — ignores page filters.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-4 w-4 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-6 px-6 pt-1">
                    <div className="text-[34px] font-bold tracking-tight leading-none">{accidents.length}</div>
                    <p className="text-xs text-muted-foreground mt-2.5">Since go-live · all statuses</p>
                  </CardContent>
                </Card>
              </Link>
            </SortableWidget>
          ),
          "open-claims": (
            <SortableWidget key="open-claims" id="open-claims">
              <Link href="/claims?status=active&from=claims-dashboard">
                <Card className="hover-elevate cursor-pointer border-destructive/40 h-full">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-[15px] font-semibold text-foreground truncate">Open Claims</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" onClick={(e) => e.preventDefault()} />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                          <p className="font-semibold">Open Claims</p>
                          <p>Count of claims where status is Active, Pending, or Investigating and Incident Date is on or after 2/9/2026.</p>
                          <p className="text-muted-foreground">Date basis: Incident Date. Global — ignores page filters.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-destructive" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-6 px-6 pt-1">
                    <div className="text-[34px] font-bold tracking-tight leading-none text-destructive" data-testid="metric-open-claims">{openClaims.length}</div>
                    <p className="text-xs text-muted-foreground mt-2.5">Active · Pending · Investigating</p>
                  </CardContent>
                </Card>
              </Link>
            </SortableWidget>
          ),
          "probable-exposure": (
            <SortableWidget key="probable-exposure" id="probable-exposure">
              <Link href="/financial-intelligence?from=claims-dashboard">
                <Card className="hover-elevate cursor-pointer border-destructive/25 h-full">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-[15px] font-semibold text-foreground truncate">Open Claims Probable Cost</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" onClick={(e) => e.preventDefault()} />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                          <p className="font-semibold">Open Claims Probable Cost</p>
                          <p>Sum of probable cost for all open claims (Active, Pending, Investigating) with Incident Date on or after 2/9/2026.</p>
                          <p className="text-muted-foreground">Date basis: Incident Date. Global — ignores page filters. Claims with no probable cost assigned are included at $0.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-destructive" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-6 px-6 pt-1">
                    <div className="text-[34px] font-bold tracking-tight leading-none text-destructive" data-testid="metric-open-claims-probable-cost">
                      {fmt$(openClaimsProbableCost)}
                    </div>
                    {openClaimsMissingCost ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2.5">Some open claims do not have probable cost assigned</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2.5">Open claims exposure</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </SortableWidget>
          ),
          "investigating": (
            <SortableWidget key="investigating" id="investigating">
              <Link href="/financial-intelligence?from=claims-dashboard">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-[15px] font-semibold text-foreground truncate">Closed Claims: Actual vs Probable</CardTitle>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                        <p className="font-semibold">Closed Claims: Actual vs Probable Cost</p>
                        <p>Compares total actual repair cost vs probable cost for claims not in Active, Pending, or Investigating status — shown for YTD and MTD.</p>
                        <p className="text-muted-foreground">Date basis: Repair Completion Date if available, otherwise Incident Date. Global — ignores page filters. Variance = Actual − Probable.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6 px-6 pt-1 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">YTD {currentYear}</p>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[24px] font-bold tracking-tight leading-none" data-testid="metric-ytd-actual-widget">{fmt$(closedYTDActual)}</span>
                      <span className="text-xs text-muted-foreground">actual</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{fmt$(closedYTDProbable)} probable</span>
                      {closedYTDVariance !== 0 && (
                        <span className={`text-xs font-semibold ${closedYTDVariance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                          {closedYTDVariance > 0 ? "+" : ""}{fmt$(closedYTDVariance)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">MTD</p>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[22px] font-bold tracking-tight leading-none" data-testid="metric-mtd-actual-widget">{fmt$(closedMTDActual)}</span>
                      <span className="text-xs text-muted-foreground">actual</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{fmt$(closedMTDProbable)} probable</span>
                      {closedMTDVariance !== 0 && (
                        <span className={`text-xs font-semibold ${closedMTDVariance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                          {closedMTDVariance > 0 ? "+" : ""}{fmt$(closedMTDVariance)}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              </Link>
            </SortableWidget>
          ),
          "avg-cost-per-month": (
            <SortableWidget key="avg-cost-per-month" id="avg-cost-per-month">
              <Link href="/financial-intelligence?from=claims-dashboard">
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-[15px] font-semibold text-foreground truncate">Average Cost per Month</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" onClick={(e) => e.preventDefault()} />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                          <p className="font-semibold">Average Cost per Month</p>
                          <p>For closed claims only: (1) For each calendar month, compute that month's average repair cost per claim. (2) Average those monthly averages across all months with data.</p>
                          <p className="text-muted-foreground">Date basis: Closed Date (Repair Completion Date, or Incident Date if not available). Global — ignores page filters.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-6 px-6 pt-1">
                    <div className="text-[34px] font-bold tracking-tight leading-none" data-testid="metric-avg-cost-per-month">
                      {avgCostPerMonth > 0 ? fmt$(avgCostPerMonth) : "—"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2.5">
                      Across {monthlyRepairGroups.size} month{monthlyRepairGroups.size !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </SortableWidget>
          ),
          "closed": (
            <SortableWidget key="closed" id="closed">
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 pt-6 px-6">
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-[15px] font-semibold text-foreground truncate">Claims / 1k Moves</CardTitle>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground/70 cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1.5">
                        <p className="font-semibold">Claims / 1,000 Moves</p>
                        <p>Number of claims per 1,000 completed moves. Formula: (Total Claims ÷ Total Moves) × 1,000.</p>
                        <p className="text-muted-foreground">All-time totals. Global — ignores page filters.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6 px-6 pt-1">
                  <div className="text-[34px] font-bold tracking-tight leading-none" data-testid="metric-claims-per-1k-moves">
                    {claimsPer1kMoves !== null ? claimsPer1kMoves : "—"}
                  </div>
                  {claimsPer1kMoves !== null ? (
                    <div className="mt-2.5 space-y-0.5">
                      <p className="text-xs text-muted-foreground">
                        {accidents.length} claims / {totalMovesAllTime.toLocaleString()} moves
                      </p>
                      {claimsPer1kMoves30d !== null && (
                        <p className="text-xs text-muted-foreground">
                          30d: {claims30d.length} / {totalMoves30d.toLocaleString()} moves
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2.5">No move data available</p>
                  )}
                </CardContent>
              </Card>
            </SortableWidget>
          ),
        };
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
              <div data-testid="claims-summary-bar" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                {widgetOrder.filter((id) => !hiddenWidgets.includes(id)).map((id) => widgetMap[id])}
              </div>
            </SortableContext>
          </DndContext>
        );
      })()}

      {/* Main tab section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="claims-dashboard-tabs">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-claims-overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-claims-analytics">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Risk Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <h2 className="text-lg font-bold" data-testid="text-claims-workspace-header">Claims Workspace</h2>

          {/* Active Alerts Summary */}
          <ClaimAlertsSummaryCard />

          {/* Closed Claims Actual vs Probable Cost */}
          <Card data-testid="card-closed-claims-cost">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Closed Claims: Actual vs Probable Cost</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      Compares total actual repair cost vs probable cost for closed claims, shown for YTD and MTD. Date basis: Repair Completion Date if available, otherwise Incident Date.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Badge variant="outline" className="text-xs font-normal">
                  Excludes Active · Pending · Investigating
                </Badge>
              </div>
              <CardDescription>Expected vs actual cost performance for resolved claims</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* YTD */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    YTD ({currentYear})
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Actual (Final Repair)</span>
                      <span className="text-sm font-semibold" data-testid="metric-ytd-actual">
                        {fmt$(closedYTDActual)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Probable (Estimated)</span>
                      <span className="text-sm font-semibold" data-testid="metric-ytd-probable">
                        {fmt$(closedYTDProbable)}
                      </span>
                    </div>
                    <div className="border-t pt-2 flex items-center justify-between">
                      <span className="text-sm font-medium">Variance</span>
                      <div className="flex items-center gap-1">
                        {closedYTDVariance < 0 ? (
                          <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                        ) : closedYTDVariance > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-destructive" />
                        ) : null}
                        <span
                          className={`text-sm font-bold ${closedYTDVariance < 0 ? "text-green-600" : closedYTDVariance > 0 ? "text-destructive" : "text-muted-foreground"}`}
                          data-testid="metric-ytd-variance"
                        >
                          {closedYTDVariance >= 0 ? "+" : ""}{fmt$(closedYTDVariance)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Based on {closedClaimsYTD.length} closed claim{closedClaimsYTD.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* MTD */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    MTD ({now.toLocaleString("default", { month: "long" })} {currentYear})
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Actual (Final Repair)</span>
                      <span className="text-sm font-semibold" data-testid="metric-mtd-actual">
                        {fmt$(closedMTDActual)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Probable (Estimated)</span>
                      <span className="text-sm font-semibold" data-testid="metric-mtd-probable">
                        {fmt$(closedMTDProbable)}
                      </span>
                    </div>
                    <div className="border-t pt-2 flex items-center justify-between">
                      <span className="text-sm font-medium">Variance</span>
                      <div className="flex items-center gap-1">
                        {closedMTDVariance < 0 ? (
                          <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                        ) : closedMTDVariance > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-destructive" />
                        ) : null}
                        <span
                          className={`text-sm font-bold ${closedMTDVariance < 0 ? "text-green-600" : closedMTDVariance > 0 ? "text-destructive" : "text-muted-foreground"}`}
                          data-testid="metric-mtd-variance"
                        >
                          {closedMTDVariance >= 0 ? "+" : ""}{fmt$(closedMTDVariance)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Based on {closedClaimsMTD.length} closed claim{closedClaimsMTD.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
            <div className="px-6 pb-5 pt-3 border-t border-border flex items-center justify-end">
              <Link href="/financial-intelligence?from=claims-dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View Financial Details
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>

          <Card data-testid="card-loss-impact-summary">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                <CardTitle>Loss Impact Summary</CardTitle>
              </div>
              <CardDescription>Market and driver risk score overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Market Risk Score</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold ${lossImpact.marketLossScore > 50 ? 'text-destructive' : lossImpact.marketLossScore > 25 ? 'text-amber-500' : 'text-green-600'}`} data-testid="text-market-loss-score">
                      {lossImpact.marketLossScore}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <Progress value={lossImpact.marketLossScore} className={`h-1 mt-2 ${lossImpact.marketLossScore > 50 ? '[&>div]:bg-destructive' : lossImpact.marketLossScore > 25 ? '[&>div]:bg-amber-500' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Driver Risk Score</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-driver-loss-score-avg">
                    {lossImpact.driverLossScoreAvg}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">High-Risk Drivers</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold ${lossImpact.highRiskDriverCount > 0 ? 'text-destructive' : ''}`} data-testid="text-high-risk-drivers">
                      {lossImpact.highRiskDriverCount}
                    </span>
                    {lossImpact.highRiskDriverCount > 0 && (
                      <Badge variant="destructive" className="text-xs">2+ claims</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">At-Fault Claims</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-at-fault-claims">
                    {lossImpact.totalAtFaultClaims}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Claims Cost</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-total-claims-cost">
                    ${lossImpact.totalClaimsCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Claims / 1k Moves</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        Number of claims per 1,000 completed moves.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-2xl font-bold mt-1" data-testid="text-claims-per-1k-moves">
                    {claimsPer1kMoves !== null ? claimsPer1kMoves : "—"}
                  </p>
                  {totalMoves30d > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      30d: {claims30d.length} / {totalMoves30d.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
            <div className="px-6 pb-5 pt-3 border-t border-border flex items-center justify-end">
              <Link href="/corporate/at-risk-drivers?from=claims-dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View At-Risk Drivers
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>

          {/* Recovery Metrics */}
          <Card data-testid="card-recovery-metrics">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
                <CardTitle>Recovery & Subrogation Metrics</CardTitle>
              </div>
              <CardDescription>Track cost recovery across all claims</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Recovered</p>
                  <p className="text-2xl font-bold text-green-600 mt-1" data-testid="text-total-recovered">
                    ${(recoveryMetrics?.totalRecoveredAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Gross Claims Cost</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-gross-claims-cost">
                    ${(recoveryMetrics?.grossClaimsCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Claims Cost</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-net-claims-cost">
                    ${(recoveryMetrics?.netClaimsCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Recovery Rate</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold ${(recoveryMetrics?.recoveryRate || 0) > 10 ? 'text-green-600' : ''}`} data-testid="text-recovery-rate">
                      {recoveryMetrics?.recoveryRate || 0}%
                    </span>
                    {(recoveryMetrics?.recoveryRate || 0) > 10 && (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Recovery Pursued</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-claims-recovery-pursued">
                    {recoveryMetrics?.claimsWithRecoveryPursued || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    of {recoveryMetrics?.totalClaims || 0} claims ({recoveryMetrics?.percentClaimsWithRecoveryPursued || 0}%)
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Savings</p>
                  <p className={`text-2xl font-bold mt-1 ${(recoveryMetrics?.totalRecoveredAmount || 0) > 0 ? 'text-green-600' : ''}`} data-testid="text-net-savings">
                    ${(recoveryMetrics?.totalRecoveredAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Litigation Hold */}
          <Card data-testid="card-litigation-metrics">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-amber-600" />
                <CardTitle>Litigation Hold & Legal Readiness</CardTitle>
              </div>
              <CardDescription>Track claims with litigation holds and legal risk indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Active Holds</p>
                  </div>
                  <p className="text-3xl font-bold text-red-600" data-testid="text-active-holds">
                    {litigationMetrics?.activeHoldsCount || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Claims under litigation hold</p>
                </div>
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Severe Claims</p>
                  </div>
                  <p className="text-3xl font-bold text-amber-600" data-testid="text-severe-claims">
                    {litigationMetrics?.severeClaimsCount || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">High severity rating</p>
                </div>
                <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
                  <div className="flex items-center gap-2 mb-2">
                    <Ambulance className="h-4 w-4 text-rose-600" />
                    <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Injury Claims</p>
                  </div>
                  <p className="text-3xl font-bold text-rose-600" data-testid="text-injury-claims">
                    {litigationMetrics?.injuryClaimsCount || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Claims with injuries</p>
                </div>
                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900">
                  <div className="flex items-center gap-2 mb-2">
                    <MailWarning className="h-4 w-4 text-purple-600" />
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Attorney Letters</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-600" data-testid="text-attorney-letters">
                    {litigationMetrics?.attorneyLetterClaimsCount || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Letters received</p>
                </div>
              </div>
              {(litigationMetrics?.activeHoldsCount || 0) > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-center gap-3">
                  <Lock className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {litigationMetrics?.activeHoldsCount} claim{(litigationMetrics?.activeHoldsCount || 0) !== 1 ? 's' : ''} under litigation hold
                    </p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/70">
                      Evidence is preserved and editing is restricted on these claims
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Drug Test Compliance */}
          <Card data-testid="card-drug-test-metrics">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-blue-600" />
                <CardTitle>Drug Test Compliance</CardTitle>
              </div>
              <CardDescription>Post-accident drug testing status and compliance tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Required</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1" data-testid="text-drug-test-total">
                    {drugTestMetrics?.totalRequired || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1" data-testid="text-drug-test-pending">
                    {drugTestMetrics?.pendingCount || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3 w-3 text-red-600" />
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Overdue</p>
                  </div>
                  <p className="text-2xl font-bold text-red-600" data-testid="text-drug-test-overdue">
                    {drugTestMetrics?.overdueCount || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900">
                  <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Acknowledged</p>
                  <p className="text-2xl font-bold text-indigo-600 mt-1" data-testid="text-drug-test-acknowledged">
                    {drugTestMetrics?.acknowledgedCount || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Completed</p>
                  <p className="text-2xl font-bold text-green-600 mt-1" data-testid="text-drug-test-completed">
                    {drugTestMetrics?.completedCount || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-900">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Waived</p>
                  <p className="text-2xl font-bold text-gray-600 mt-1" data-testid="text-drug-test-waived">
                    {drugTestMetrics?.waivedCount || 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Compliance Rate</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold ${(drugTestMetrics?.complianceRate || 100) >= 80 ? 'text-emerald-600' : 'text-amber-600'}`} data-testid="text-drug-test-compliance">
                      {drugTestMetrics?.complianceRate || 100}%
                    </span>
                    {(drugTestMetrics?.complianceRate || 100) >= 80 && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                  </div>
                </div>
              </div>
              {(drugTestMetrics?.overdueCount || 0) > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {drugTestMetrics?.overdueCount} drug test{(drugTestMetrics?.overdueCount || 0) !== 1 ? 's' : ''} overdue
                    </p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/70">
                      Drivers have exceeded the 24-hour window for completing their drug tests
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-5 pt-3 border-t border-border flex items-center justify-end">
              <Link href="/reports/compliance?from=claims-dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                View Compliance Report
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  At-Fault Analysis
                </CardTitle>
                <CardDescription>Fault determination breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium">At Fault</span>
                    </div>
                    <Badge variant="destructive">{atFaultClaims.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Not At Fault</span>
                    </div>
                    <Badge className="bg-green-600">{notAtFaultClaims.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Pending</span>
                    </div>
                    <Badge variant="secondary">{pendingFaultClaims.length}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Cost Summary
                </CardTitle>
                <CardDescription>Financial impact overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Probable Cost (Estimated)</p>
                    <p className="text-2xl font-bold">${totalProbableCost.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Actual Cost (Confirmed)</p>
                    <p className="text-2xl font-bold text-primary">${totalActualCost.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Status Distribution
                </CardTitle>
                <CardDescription>Claims by status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <span>Open</span>
                    <Badge variant="destructive">{openClaims.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <span>Investigating</span>
                    <Badge>{investigatingClaims.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <span>Resolved</span>
                    <Badge variant="secondary">{resolvedClaims.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg border">
                    <span>Closed</span>
                    <Badge variant="outline">{closedClaims.length}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Claims
              </CardTitle>
              <CardDescription>Latest reported incidents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentClaims.map((claim) => (
                  <Link key={claim.id} href={`/accidents/${claim.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium">{getDriverName(claim.driverId)}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(claim.accidentDate)} - {claim.incidentType || "Incident"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {claim.dodAtFault === "yes" && (
                          <Badge variant="destructive">At Fault</Badge>
                        )}
                        <ClaimStatusBadge status={(claim as any).claimStatus} size="sm" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Candidate Risk Overview
              </CardTitle>
              <CardDescription>
                View recruiting candidate summaries with risk flags for claims assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CandidateSummaryPanel readOnly />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ANALYTICS TAB ────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-6 mt-4">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Markets Tracked</p>
                        <p className="text-2xl font-bold">{analyticsData?.byMarket?.length ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Highest Prev. Rate (Market)</p>
                        <p className="text-2xl font-bold">
                          {analyticsData?.byMarket?.length
                            ? `${Math.max(...analyticsData.byMarket.map(r => r.preventableRate))}%`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Drivers w/ Preventable Claims</p>
                        <p className="text-2xl font-bold">
                          {analyticsData?.byDriver?.filter(d => d.preventableClaims > 0).length ?? 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* By Market */}
              <Card data-testid="card-analytics-by-market">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle>Claims by Market</CardTitle>
                  </div>
                  <CardDescription>Top markets ranked by total claim volume with preventability breakdown</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <AnalyticsTable
                    rows={analyticsData?.byMarket ?? []}
                    emptyMessage="No market-level claims data. Ensure claims have a Market assigned."
                  />
                </CardContent>
              </Card>

              {/* By Location */}
              <Card data-testid="card-analytics-by-location">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    <CardTitle>Claims by Location</CardTitle>
                  </div>
                  <CardDescription>Incident hotspots ranked by claim frequency</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <AnalyticsTable
                    rows={analyticsData?.byLocation ?? []}
                    emptyMessage="No location-level claims data. Ensure claims have a Location field filled in."
                  />
                </CardContent>
              </Card>

              {/* By Customer */}
              <Card data-testid="card-analytics-by-customer">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-purple-500" />
                    <CardTitle>Claims by Customer / Account</CardTitle>
                  </div>
                  <CardDescription>Accounts with the most claims — useful for risk-based pricing conversations</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <AnalyticsTable
                    rows={analyticsData?.byCustomer ?? []}
                    emptyMessage="No customer-linked claims found."
                    linkPrefix="/accounts"
                  />
                </CardContent>
              </Card>

              {/* By Driver */}
              <Card data-testid="card-analytics-by-driver">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-destructive" />
                    <CardTitle>Drivers with Most Preventable Claims</CardTitle>
                  </div>
                  <CardDescription>Sorted by preventable claim count — flags repeat offenders for coaching or review</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <AnalyticsTable
                    rows={analyticsData?.byDriver ?? []}
                    emptyMessage="No driver-level claims data found."
                    linkPrefix="/drivers"
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ClaimsWidgetLibrary
        open={widgetLibraryOpen}
        onOpenChange={setWidgetLibraryOpen}
        widgetOrder={widgetOrder}
        hiddenWidgets={hiddenWidgets}
        onReorder={handleWidgetReorder}
        onToggle={handleWidgetToggle}
      />
    </div>
  );
}
