import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Shield, Clock, AlertCircle, CalendarCheck,
  FileWarning, TimerOff, ChevronDown, ChevronUp,
  Loader2, X,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WidgetCase {
  id: string;
  caseNumber: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  status: string;
  startDate: string | null;
  expectedReturnDate: string | null;
  certificationDueDate: string | null;
  certificationReceivedDate: string | null;
  department: string | null;
  title: string | null;
  exhaustionDate: string | null;
  returnDate: string | null;
  certDueDate: string | null;
}

interface WidgetData {
  onAnyLeave: WidgetCase[];
  onCfraLeave: WidgetCase[];
  certOverdue: WidgetCase[];
  certDueSoon: WidgetCase[];
  upcomingReleases7: WidgetCase[];
  upcomingReleases14: WidgetCase[];
  upcomingReleases30: WidgetCase[];
  missingDocs: WidgetCase[];
  exhaustionApproaching: WidgetCase[];
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  cfra: "CFRA", fmla: "FMLA", cfra_fmla: "CFRA+FMLA", cfra_pregnancy: "CFRA Pregnancy",
  ada: "ADA", military: "Military", bereavement: "Bereavement",
  workers_comp: "Workers' Comp", personal: "Personal", other: "Other",
  medical: "Medical",
};

// ── Widget Config ─────────────────────────────────────────────────────────────

type WidgetKey =
  | "onAnyLeave"
  | "onCfraLeave"
  | "certOverdue"
  | "certDueSoon"
  | "upcomingReleases"
  | "missingDocs"
  | "exhaustionApproaching";

interface WidgetDef {
  key: WidgetKey;
  title: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  severity?: "critical" | "warning" | "info" | "neutral";
  getCount: (d: WidgetData) => number;
  getCases: (d: WidgetData, sub?: string) => WidgetCase[];
  subGroups?: { key: string; label: string; getCount: (d: WidgetData) => number }[];
}

const WIDGETS: WidgetDef[] = [
  {
    key: "onAnyLeave",
    title: "On Leave",
    description: "Employees with active leave cases",
    icon: Users,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600 dark:text-blue-400",
    severity: "neutral",
    getCount: (d) => d.onAnyLeave.length,
    getCases: (d) => d.onAnyLeave,
  },
  {
    key: "onCfraLeave",
    title: "CFRA / FMLA",
    description: "Protected leave cases requiring compliance tracking",
    icon: Shield,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    severity: "neutral",
    getCount: (d) => d.onCfraLeave.length,
    getCases: (d) => d.onCfraLeave,
  },
  {
    key: "certDueSoon",
    title: "Certs Due Soon",
    description: "Medical certifications due within 14 days",
    icon: Clock,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-600 dark:text-yellow-500",
    severity: "warning",
    getCount: (d) => d.certDueSoon.length,
    getCases: (d) => d.certDueSoon,
  },
  {
    key: "certOverdue",
    title: "Certs Overdue",
    description: "Medical certifications past their due date",
    icon: AlertCircle,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    severity: "critical",
    getCount: (d) => d.certOverdue.length,
    getCases: (d) => d.certOverdue,
  },
  {
    key: "upcomingReleases",
    title: "Upcoming Returns",
    description: "Employees expected back within 30 days",
    icon: CalendarCheck,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-600 dark:text-green-400",
    severity: "info",
    getCount: (d) => d.upcomingReleases30.length,
    getCases: (d, sub) => {
      if (sub === "7")  return d.upcomingReleases7;
      if (sub === "14") return d.upcomingReleases14;
      return d.upcomingReleases30;
    },
    subGroups: [
      { key: "7",  label: "7 days",  getCount: (d) => d.upcomingReleases7.length },
      { key: "14", label: "14 days", getCount: (d) => d.upcomingReleases14.length },
      { key: "30", label: "30 days", getCount: (d) => d.upcomingReleases30.length },
    ],
  },
  {
    key: "missingDocs",
    title: "Missing Docs",
    description: "Cases lacking one or more primary documents",
    icon: FileWarning,
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-600 dark:text-orange-400",
    severity: "warning",
    getCount: (d) => d.missingDocs.length,
    getCases: (d) => d.missingDocs,
  },
  {
    key: "exhaustionApproaching",
    title: "Leave Exhausting",
    description: "CFRA / FMLA entitlement expires within 14 days",
    icon: TimerOff,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
    severity: "critical",
    getCount: (d) => d.exhaustionApproaching.length,
    getCases: (d) => d.exhaustionApproaching,
  },
];

// ── Drilldown Row ─────────────────────────────────────────────────────────────

function DrilldownRow({ c, widgetKey, sub }: { c: WidgetCase; widgetKey: WidgetKey; sub?: string }) {
  const daysUntilReturn = c.returnDate
    ? Math.round((new Date(c.returnDate).getTime() - Date.now()) / 86400000)
    : null;
  const daysUntilExhaustion = c.exhaustionDate
    ? Math.round((new Date(c.exhaustionDate).getTime() - Date.now()) / 86400000)
    : null;
  const certDaysOverdue = c.certDueDate && !c.certificationReceivedDate
    ? Math.round((Date.now() - new Date(c.certDueDate).getTime()) / 86400000)
    : null;

  return (
    <div className="flex items-center gap-3 p-3 border rounded-md" data-testid={`drilldown-row-${c.id}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{c.employeeName}</p>
            <Badge variant="outline" className="text-xs">
              {LEAVE_TYPE_LABELS[c.leaveType] ?? c.leaveType}
            </Badge>
            {c.department && (
              <span className="text-xs text-muted-foreground">{c.department}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{c.caseNumber}</span>
            {widgetKey === "certOverdue" && certDaysOverdue !== null && certDaysOverdue > 0 && (
              <span className="text-xs text-destructive font-medium">{certDaysOverdue}d overdue</span>
            )}
            {widgetKey === "certDueSoon" && c.certDueDate && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                Due {formatDate(c.certDueDate)}
              </span>
            )}
            {widgetKey === "upcomingReleases" && c.returnDate && daysUntilReturn !== null && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Returns in {Math.max(0, daysUntilReturn)}d — {formatDate(c.returnDate)}
              </span>
            )}
            {widgetKey === "exhaustionApproaching" && c.exhaustionDate && daysUntilExhaustion !== null && (
              <span className={`text-xs font-medium ${daysUntilExhaustion <= 3 ? "text-destructive" : "text-orange-600 dark:text-orange-400"}`}>
                Exhausts in {Math.max(0, daysUntilExhaustion)}d — {formatDate(c.exhaustionDate)}
              </span>
            )}
            {widgetKey === "onAnyLeave" && c.startDate && (
              <span className="text-xs text-muted-foreground">Since {formatDate(c.startDate)}</span>
            )}
            {widgetKey === "missingDocs" && (
              <span className="text-xs text-orange-600 dark:text-orange-400">Primary docs incomplete</span>
            )}
          </div>
        </div>
      </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LeaveWidgetsSection() {
  const { isSuperAdmin, isCorporate } = usePermissions();
  const [activeWidget, setActiveWidget] = useState<WidgetKey | null>(null);
  const [activeSub, setActiveSub] = useState<string>("30");

  const { data, isLoading } = useQuery<WidgetData>({
    queryKey: ["/api/corporate/leave-cases/widget-data"],
    queryFn: () => fetch("/api/corporate/leave-cases/widget-data").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (!isSuperAdmin && !isCorporate) return null;

  const def = WIDGETS.find((w) => w.key === activeWidget);
  const drilldownCases = data && def ? def.getCases(data, activeSub) : [];

  function toggleWidget(key: WidgetKey) {
    if (activeWidget === key) {
      setActiveWidget(null);
    } else {
      setActiveWidget(key);
      if (key === "upcomingReleases") setActiveSub("30");
    }
  }

  return (
    <div className="space-y-4" data-testid="section-leave-widgets">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Leave Management Overview</h2>
          <p className="text-sm text-muted-foreground">
            Real-time snapshot across all active leave cases — click any widget to drill in
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {WIDGETS.map((w) => {
          const count = data ? w.getCount(data) : null;
          const isActive = activeWidget === w.key;
          const Icon = w.icon;

          return (
            <button
              key={w.key}
              onClick={() => toggleWidget(w.key)}
              className="text-left"
              data-testid={`widget-${w.key}`}
            >
              <Card className={`h-full transition-all hover-elevate cursor-pointer ${
                isActive ? "ring-2 ring-primary" : ""
              } ${
                count && count > 0 && w.severity === "critical"
                  ? "border-destructive/30"
                  : count && count > 0 && w.severity === "warning"
                  ? "border-yellow-400/40 dark:border-yellow-500/30"
                  : ""
              }`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-medium leading-tight">{w.title}</CardTitle>
                  <div className={`h-8 w-8 rounded-lg ${w.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${w.iconColor}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {isLoading ? (
                    <div className="h-8 w-12 bg-muted animate-pulse rounded" />
                  ) : (
                    <div className={`text-3xl font-bold tabular-nums ${
                      count && count > 0 && w.severity === "critical"
                        ? "text-destructive"
                        : count && count > 0 && w.severity === "warning"
                        ? "text-yellow-600 dark:text-yellow-500"
                        : ""
                    }`}>
                      {count ?? "—"}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{w.description}</p>
                  {w.subGroups && data && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {w.subGroups.map((sg) => (
                        <span key={sg.key} className="text-xs text-muted-foreground">
                          {sg.label}: <span className="font-medium text-foreground">{sg.getCount(data)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {isActive && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
                      <ChevronUp className="h-3 w-3" /> Collapse
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Drilldown Panel */}
      {activeWidget && def && (
        <Card className="border-primary/20" data-testid="panel-drilldown">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <def.icon className={`h-4 w-4 ${def.iconColor}`} />
                  {def.title}
                  <Badge variant="secondary" className="text-xs">
                    {drilldownCases.length} case{drilldownCases.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">{def.description} — click a row to open the employee record</CardDescription>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setActiveWidget(null)} data-testid="button-close-drilldown">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Sub-group tabs for Upcoming Returns */}
            {def.subGroups && data && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {def.subGroups.map((sg) => (
                  <Button
                    key={sg.key}
                    size="sm"
                    variant={activeSub === sg.key ? "default" : "outline"}
                    onClick={() => setActiveSub(sg.key)}
                    data-testid={`subtab-${sg.key}`}
                  >
                    {sg.label}
                    <Badge variant="secondary" className="ml-1.5 text-xs">{sg.getCount(data)}</Badge>
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent>
            {drilldownCases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-drilldown">
                No cases in this group right now
              </div>
            ) : (
              <div className="space-y-2">
                {drilldownCases.map((c) => (
                  <DrilldownRow key={c.id} c={c} widgetKey={activeWidget!} sub={activeSub} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
