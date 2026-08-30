import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Target, FileWarning, DollarSign, BarChart3, ShieldAlert, TrendingUp,
  Users, Truck, Clock, AlertTriangle, CheckCircle, Activity, Search,
  ArrowLeft, LayoutDashboard, Star, StarOff, Info, UserX,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// ── Widget Registry ────────────────────────────────────────────────────────────
export interface WidgetDefinition {
  id: string;
  module: string;
  title: string;
  description: string;
  icon: React.ElementType;
  metrics: string[];
  drillDown: boolean;
  route: string;
  tags: string[];
  componentKey?: string;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ── Claims / Safety ──────────────────────────────────────────────────────────
  {
    id: "claims-total",
    module: "Claims",
    title: "Total Claims",
    description: "Count of all claims since go-live (2/9/2026) and month-to-date, by incident date.",
    icon: Target,
    metrics: ["Since Go-Live", "MTD"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "count", "go-live"],
  },
  {
    id: "claims-open",
    module: "Claims",
    title: "Open Claims",
    description: "Active, Pending, and Investigating claims with incident date on or after go-live.",
    icon: FileWarning,
    metrics: ["Count"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "open", "active"],
  },
  {
    id: "claims-probable-cost",
    module: "Claims",
    title: "Open Claims Probable Cost",
    description: "Sum of probable repair cost across all open claims since go-live.",
    icon: DollarSign,
    metrics: ["Total Probable $"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "cost", "exposure"],
  },
  {
    id: "claims-closed-variance",
    module: "Claims",
    title: "Closed: Actual vs Probable",
    description: "Compares actual repair cost to probable cost for closed claims. Shows YTD and MTD variance.",
    icon: DollarSign,
    metrics: ["YTD Actual", "YTD Probable", "MTD Actual", "MTD Probable", "Variance"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "cost", "closed", "variance"],
  },
  {
    id: "claims-per-1k",
    module: "Claims",
    title: "Claims / 1k Moves",
    description: "Number of claims per 1,000 completed moves. Rolling 90-day and 30-day windows.",
    icon: Target,
    metrics: ["90d Rate", "30d Rate"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "rate", "moves", "kpi"],
  },
  {
    id: "claims-avg-cost-month",
    module: "Claims",
    title: "Avg Cost per Month",
    description: "Average actual repair cost per calendar month for closed claims since go-live.",
    icon: DollarSign,
    metrics: ["Monthly Average"],
    drillDown: true,
    route: "/safety",
    tags: ["claims", "cost", "average", "monthly"],
  },
  // ── Safety ──────────────────────────────────────────────────────────────────
  {
    id: "safety-risk-signals",
    module: "Safety",
    title: "Risk Signals",
    description: "High-risk moves, claims from HR data, and average risk score.",
    icon: ShieldAlert,
    metrics: ["High-Risk Moves", "HR Claims", "Avg Risk Score"],
    drillDown: false,
    route: "/safety",
    tags: ["safety", "risk", "hr"],
  },
  {
    id: "safety-photo-compliance",
    module: "Safety",
    title: "Photo & Evidence Compliance",
    description: "Move photo compliance rates and claims evidence rates.",
    icon: Activity,
    metrics: ["Photo Rate", "Evidence Rate", "Favorable Outcome Rate"],
    drillDown: false,
    route: "/safety",
    tags: ["safety", "compliance", "photos", "evidence"],
  },
  {
    id: "safety-loss-patterns",
    module: "Safety",
    title: "Loss Patterns",
    description: "Top locations, drivers, and peak times contributing to claims.",
    icon: BarChart3,
    metrics: ["Top Location", "Top Driver", "Peak Time", "Repeat Drivers", "Preventable %"],
    drillDown: false,
    route: "/safety",
    tags: ["safety", "patterns", "analytics"],
  },
  // ── Financial ────────────────────────────────────────────────────────────────
  {
    id: "financial-forecast",
    module: "Financial",
    title: "Rolling 12-Month Forecast",
    description: "AI-driven rolling 12-month revenue and cost forecast with confidence intervals.",
    icon: TrendingUp,
    metrics: ["Forecast Revenue", "Forecast Cost", "Confidence"],
    drillDown: false,
    route: "/financial-intelligence",
    tags: ["financial", "forecast", "ai", "revenue"],
  },
  {
    id: "financial-margin",
    module: "Financial",
    title: "Margin Intelligence",
    description: "Gross and net margin trends by account and time period.",
    icon: DollarSign,
    metrics: ["Gross Margin", "Net Margin", "Trend"],
    drillDown: false,
    route: "/financial-intelligence",
    tags: ["financial", "margin", "profitability"],
  },
  {
    id: "financial-pl-variance",
    module: "Financial",
    title: "P&L Variance",
    description: "Actual vs. budgeted P&L variance by month and cost category.",
    icon: BarChart3,
    metrics: ["Actual vs Budget", "Variance $", "Variance %"],
    drillDown: false,
    route: "/financial-intelligence",
    tags: ["financial", "pl", "variance", "budget"],
  },
  // ── Drivers ─────────────────────────────────────────────────────────────────
  {
    id: "drivers-active",
    module: "Drivers",
    title: "Active Drivers",
    description: "Count of drivers currently in active status.",
    icon: Users,
    metrics: ["Active Count"],
    drillDown: false,
    route: "/drivers",
    tags: ["drivers", "headcount", "active"],
  },
  {
    id: "drivers-retention",
    module: "Drivers",
    title: "Driver Retention",
    description: "30-day and 90-day driver retention rates.",
    icon: TrendingUp,
    metrics: ["30d Retention", "90d Retention"],
    drillDown: false,
    route: "/drivers",
    tags: ["drivers", "retention", "turnover"],
  },
  // ── Scheduling ───────────────────────────────────────────────────────────────
  {
    id: "scheduling-coverage",
    module: "Scheduling",
    title: "Shift Coverage",
    description: "Percentage of shifts covered vs. scheduled for the current week.",
    icon: Clock,
    metrics: ["Coverage %", "Open Shifts"],
    drillDown: false,
    route: "/scheduling",
    tags: ["scheduling", "shifts", "coverage"],
  },
  {
    id: "scheduling-overtime",
    module: "Scheduling",
    title: "Overtime Alerts",
    description: "Drivers approaching or exceeding overtime thresholds.",
    icon: AlertTriangle,
    metrics: ["At Risk", "Over Threshold"],
    drillDown: false,
    route: "/scheduling",
    tags: ["scheduling", "overtime", "compliance"],
  },
  {
    id: "attendance-exceptions",
    module: "Scheduling",
    title: "Attendance Exceptions",
    description: "Real-time and historical attendance failure detection. Shows drivers scheduled but not clocked in today, plus confirmed no-shows over the last 7 days. Drill-down includes full shift-level detail with account, date, and status filters.",
    icon: UserX,
    metrics: ["Scheduled Today – Not Clocked In", "No Shows – Last 7 Days"],
    drillDown: true,
    route: "/scheduling",
    tags: ["scheduling", "attendance", "clock-in", "no-show", "exceptions", "shifts", "compliance"],
    componentKey: "AttendanceExceptions",
  },
  {
    id: "late-drivers-widget",
    module: "Scheduling",
    title: "Late Drivers",
    description: "Tracks drivers who missed clock-in today and those with late clock-ins over the last 7 days. Drill-down shows shift date, scheduled start, actual clock-in, and minutes late with repeat-offender highlighting.",
    icon: Clock,
    metrics: ["Late Today (No Clock-In)", "Late Clock-Ins — Last 7 Days"],
    drillDown: true,
    route: "/scheduling",
    tags: ["scheduling", "attendance", "late", "clock-in", "compliance", "drivers"],
    componentKey: "LateDriversWidget",
  },
  // ── Driver Risk ──────────────────────────────────────────────────────────────
  {
    id: "at-risk-drivers",
    module: "Drivers",
    title: "At Risk Drivers",
    description: "Live count of drivers flagged across Attendance, Compliance, and Performance risk dimensions. Drills into a full driver table with filters and task creation.",
    icon: ShieldAlert,
    metrics: ["Total At Risk", "Attendance", "Compliance", "Performance"],
    drillDown: true,
    route: "/corporate/at-risk-drivers",
    tags: ["drivers", "risk", "compliance", "attendance", "performance"],
    componentKey: "AtRiskDriversWidget",
  },
  // ── Operations ───────────────────────────────────────────────────────────────
  {
    id: "ops-moves-mtd",
    module: "Operations",
    title: "Moves MTD",
    description: "Total completed moves for the current month to date.",
    icon: Truck,
    metrics: ["MTD Moves", "vs Prior Month"],
    drillDown: false,
    route: "/moves",
    tags: ["operations", "moves", "volume"],
  },
  {
    id: "ops-on-time",
    module: "Operations",
    title: "On-Time Rate",
    description: "Percentage of moves completed on time vs. scheduled window.",
    icon: CheckCircle,
    metrics: ["On-Time %", "Late Moves"],
    drillDown: false,
    route: "/moves",
    tags: ["operations", "on-time", "performance"],
  },
];

const MODULES = ["All", ...Array.from(new Set(WIDGET_REGISTRY.map((w) => w.module))).sort()];

const STORAGE_KEY = "widget_library_pinned";

function getStoredPins(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function WidgetCard({ widget, pinned, onTogglePin }: { widget: WidgetDefinition; pinned: boolean; onTogglePin: (id: string) => void }) {
  const Icon = widget.icon;
  return (
    <Card className="hover-elevate flex flex-col h-full" data-testid={`widget-card-${widget.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-muted shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm leading-tight">{widget.title}</CardTitle>
              <Badge variant="secondary" className="mt-1 text-[10px]">{widget.module}</Badge>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={pinned ? "text-amber-500" : "text-muted-foreground"}
                onClick={() => onTogglePin(widget.id)}
                data-testid={`btn-pin-${widget.id}`}
              >
                {pinned ? <Star className="h-4 w-4 fill-amber-500" /> : <StarOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? "Remove from My Dashboard" : "Add to My Dashboard"}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 pt-0">
        <CardDescription className="text-xs leading-relaxed">{widget.description}</CardDescription>
        <div className="flex flex-wrap gap-1">
          {widget.metrics.map((m) => (
            <Badge key={m} variant="outline" className="text-[10px] font-normal">{m}</Badge>
          ))}
        </div>
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {widget.drillDown && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Info className="h-3 w-3" />
                    <span>Drill-down</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Clicking this widget opens a detail view of the underlying data.</TooltipContent>
              </Tooltip>
            )}
          </div>
          <Link href={widget.route}>
            <Button size="sm" variant="ghost" className="text-xs h-7" data-testid={`btn-goto-${widget.id}`}>
              View in app
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WidgetLibrary() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [pinned, setPinned] = useState<string[]>(getStoredPins);

  const filtered = WIDGET_REGISTRY.filter((w) => {
    const matchMod = moduleFilter === "All" || w.module === moduleFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.tags.some((t) => t.includes(q));
    return matchMod && matchSearch;
  });

  const pinnedWidgets = WIDGET_REGISTRY.filter((w) => pinned.includes(w.id));

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      const widget = WIDGET_REGISTRY.find((w) => w.id === id);
      toast({
        title: next.includes(id) ? "Added to My Dashboard" : "Removed from My Dashboard",
        description: widget?.title,
      });
      return next;
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/safety">
          <Button variant="ghost" size="sm" data-testid="btn-back-to-claims">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Widget Library</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Browse all available dashboard widgets across DriverHub 360 modules. Star a widget to add it to My Dashboard.
          </p>
        </div>
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library" data-testid="tab-library">All Widgets</TabsTrigger>
          <TabsTrigger value="pinned" data-testid="tab-pinned">
            My Dashboard
            {pinnedWidgets.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{pinnedWidgets.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── All Widgets Tab ── */}
        <TabsContent value="library" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search widgets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-widget-search"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {MODULES.map((mod) => (
                <Button
                  key={mod}
                  size="sm"
                  variant={moduleFilter === mod ? "default" : "outline"}
                  onClick={() => setModuleFilter(mod)}
                  data-testid={`btn-module-${mod.toLowerCase()}`}
                >
                  {mod}
                </Button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No widgets match your search. Try a different term or module.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((widget) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  pinned={pinned.includes(widget.id)}
                  onTogglePin={togglePin}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── My Dashboard Tab ── */}
        <TabsContent value="pinned" className="space-y-4 mt-4">
          {pinnedWidgets.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Star className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground text-sm">
                No widgets pinned yet. Go to <strong>All Widgets</strong> and star the ones you want here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {pinnedWidgets.length} widget{pinnedWidgets.length !== 1 ? "s" : ""} pinned to your dashboard.
                Click the star on any widget to remove it.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pinnedWidgets.map((widget) => (
                  <WidgetCard
                    key={widget.id}
                    widget={widget}
                    pinned={true}
                    onTogglePin={togglePin}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
