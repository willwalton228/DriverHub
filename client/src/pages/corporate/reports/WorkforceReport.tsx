import { useQuery, useMutation } from "@tanstack/react-query";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import {
  Users, UserCheck, UserMinus, UserX, ArrowLeft, ChevronRight,
  Building, Briefcase, TrendingUp, PieChart as PieChartIcon,
  TableIcon, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { DriverWithUser, DashboardWorkforceFunnel } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DistributionDriver {
  driverId: string;
  driverName: string;
  status: string;
  driverClassification: string | null;
  employmentType: string | null;
  state: string | null;
  hireDate: string | null;
  accountId: string | null;
  accountName: string | null;
}

type DrillFilter = {
  stateKey: string | null;
  classKey: "Employee" | "Employee-FT" | "Employee-PT" | "Independent Contractor" | "__blank__" | "__all__";
  label: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#6b7280"];
const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  inactive: "#6b7280",
  suspended: "#ef4444",
  onboarding: "#3b82f6",
  terminated: "#1f2937",
};

const PAGE_SIZE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d + "T00:00:00");
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

// ── Inline classification cell ────────────────────────────────────────────────

function ClassificationCell({
  driver,
  onChange,
}: {
  driver: DistributionDriver;
  onChange: (driverId: string, newVal: string | null) => void;
}) {
  const { toast } = useToast();
  const current = driver.driverClassification || "";

  const mutation = useMutation({
    mutationFn: (val: string | null) =>
      apiRequest("PATCH", `/api/corporate/drivers/${driver.driverId}`, {
        driverClassification: val || null,
      }),
    onSuccess: (_data, val) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/driver-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/drivers"] });
      onChange(driver.driverId, val);
      toast({ title: "Classification updated", description: `${driver.driverName} → ${val || "Not Set"}` });
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "Could not save classification",
        variant: "destructive",
      });
    },
  });

  return (
    <Select
      value={current}
      onValueChange={(v) => mutation.mutate(v === "__clear__" ? null : v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger
        className="h-7 text-xs w-44"
        data-testid={`select-classification-${driver.driverId}`}
      >
        <SelectValue placeholder="Not Set">
          {mutation.isPending ? "Saving…" : (current || "Not Set")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Employee">Employee</SelectItem>
        <SelectItem value="Independent Contractor">Independent Contractor</SelectItem>
        <SelectItem value="__clear__">— Clear (Not Set)</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Drill-down modal ──────────────────────────────────────────────────────────

function DrillDownModal({
  open,
  filter,
  drivers,
  onClose,
}: {
  open: boolean;
  filter: DrillFilter | null;
  drivers: DistributionDriver[];
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [localDrivers, setLocalDrivers] = useState<DistributionDriver[]>([]);

  // Keep a local copy so inline edits are reflected immediately.
  useMemo(() => {
    setLocalDrivers(drivers);
    setPage(0);
  }, [drivers]);

  const handleClassChange = (driverId: string, newVal: string | null) => {
    setLocalDrivers((prev) =>
      prev.map((d) =>
        d.driverId === driverId ? { ...d, driverClassification: newVal } : d
      )
    );
  };

  const filtered = useMemo(() => {
    if (!filter) return [];
    return localDrivers.filter((d) => {
      // State match
      if (filter.stateKey !== "__all_states__") {
        const dState = d.state || null;
        if (dState !== filter.stateKey) return false;
      }
      // Classification match
      if (filter.classKey === "__blank__") {
        if (d.driverClassification) return false;
      } else if (filter.classKey === "Employee-FT") {
        if (d.driverClassification !== "Employee") return false;
        const et = (d.employmentType || "").toLowerCase();
        if (!et.includes("full")) return false;
      } else if (filter.classKey === "Employee-PT") {
        if (d.driverClassification !== "Employee") return false;
        const et = (d.employmentType || "").toLowerCase();
        if (!et.includes("part")) return false;
      } else if (filter.classKey !== "__all__") {
        if (d.driverClassification !== filter.classKey) return false;
      }
      return true;
    });
  }, [localDrivers, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!filter) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-muted-foreground" />
            {filter.label}
            <Badge variant="secondary" className="ml-1">{filtered.length} drivers</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              No drivers match this filter
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Worker Classification</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Date of Hire</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((d) => (
                  <TableRow key={d.driverId} data-testid={`drill-row-${d.driverId}`}>
                    <TableCell className="font-medium">
                      <Link href={`/drivers/${d.driverId}`} onClick={onClose}>
                        <span
                          className="text-primary hover:underline cursor-pointer"
                          data-testid={`link-driver-${d.driverId}`}
                        >
                          {d.driverName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>
                      <ClassificationCell driver={d} onChange={handleClassChange} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.state || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.accountId ? (
                        <Link href={`/customers/${d.accountId}`} onClick={onClose}>
                          <span
                            className="text-primary hover:underline cursor-pointer"
                            data-testid={`link-account-${d.driverId}`}
                          >
                            {d.accountName || "Account"}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(d.hireDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t shrink-0">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({filtered.length} total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                data-testid="button-drill-prev"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                data-testid="button-drill-next"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkforceReport() {
  const { filters, queryKey } = useDashboardFilters();
  const [drillFilter, setDrillFilter] = useState<DrillFilter | null>(null);

  const { data: allDrivers = [], isLoading: driversLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const { data: funnel, isLoading: funnelLoading } = useQuery<DashboardWorkforceFunnel>({
    queryKey: ["/api/dashboard/funnel", queryKey],
  });

  const { data: distData = [], isLoading: distLoading } = useQuery<DistributionDriver[]>({
    queryKey: ["/api/reports/driver-distribution"],
  });

  const isLoading = driversLoading || funnelLoading;

  // ── Workforce snapshot stats (existing charts) ────────────────────────────

  const filteredDrivers = useMemo(() => {
    let result = allDrivers;
    if (filters.status && filters.status !== "all") {
      result = result.filter((d) => d.status === filters.status);
    }
    if (filters.driverType && filters.driverType !== "all") {
      result = result.filter((d) => {
        if (filters.driverType === "w2") return d.driverClassification === "Employee";
        if (filters.driverType === "ic") return d.driverClassification === "Independent Contractor";
        return true;
      });
    }
    return result;
  }, [allDrivers, filters]);

  const workforceStats = useMemo(() => {
    const drivers = filteredDrivers;
    const byStatus = {
      active:    drivers.filter((d) => d.status === "active").length,
      inactive:  drivers.filter((d) => d.status === "inactive").length,
      suspended: drivers.filter((d) => d.status === "suspended").length,
      other:     drivers.filter((d) => !["active", "inactive", "suspended"].includes(d.status || "")).length,
    };
    const byClassification = {
      w2:      drivers.filter((d) => d.driverClassification === "Employee").length,
      ic:      drivers.filter((d) => d.driverClassification === "Independent Contractor").length,
      unknown: drivers.filter((d) => !d.driverClassification).length,
    };
    const statusData = [
      { name: "Active",    value: byStatus.active,    color: STATUS_COLORS.active },
      { name: "Inactive",  value: byStatus.inactive,  color: STATUS_COLORS.inactive },
      { name: "Suspended", value: byStatus.suspended, color: STATUS_COLORS.suspended },
    ].filter((d) => d.value > 0);
    const classificationData = [
      { name: "W2 Employee",     value: byClassification.w2, color: "#3b82f6" },
      { name: "Ind. Contractor", value: byClassification.ic, color: "#8b5cf6" },
    ].filter((d) => d.value > 0);
    return { total: drivers.length, byStatus, byClassification, statusData, classificationData };
  }, [filteredDrivers]);

  const recentChanges = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newDrivers = filteredDrivers.filter((d) => {
      if (!d.createdAt) return false;
      return new Date(d.createdAt) >= thirtyDaysAgo;
    });
    return {
      newThisMonth:   newDrivers.length,
      activationRate: filteredDrivers.length > 0
        ? Math.round((workforceStats.byStatus.active / filteredDrivers.length) * 100)
        : 0,
    };
  }, [filteredDrivers, workforceStats]);

  // ── Classification by State pivot ─────────────────────────────────────────

  const filteredDist = useMemo(() => {
    let result = distData;
    if (filters.status && filters.status !== "all") {
      result = result.filter((d) => d.status === filters.status);
    }
    if (filters.driverType && filters.driverType !== "all") {
      result = result.filter((d) => {
        if (filters.driverType === "w2") return d.driverClassification === "Employee";
        if (filters.driverType === "ic") return d.driverClassification === "Independent Contractor";
        return true;
      });
    }
    return result;
  }, [distData, filters]);

  const pivot = useMemo(() => {
    const stateMap = new Map<string | null, { employeeFT: number; employeePT: number; ic: number; blank: number }>();

    for (const d of filteredDist) {
      const stateKey = d.state || null;
      if (!stateMap.has(stateKey)) stateMap.set(stateKey, { employeeFT: 0, employeePT: 0, ic: 0, blank: 0 });
      const entry = stateMap.get(stateKey)!;
      if (d.driverClassification === "Employee") {
        const et = (d.employmentType || "").toLowerCase();
        if (et.includes("full")) entry.employeeFT++;
        else if (et.includes("part")) entry.employeePT++;
        else entry.employeeFT++; // default employees with no employment_type to FT bucket
      } else if (d.driverClassification === "Independent Contractor") {
        entry.ic++;
      } else {
        entry.blank++;
      }
    }

    // Sort: named states alphabetically first, null last
    const rows = Array.from(stateMap.entries())
      .map(([stateKey, counts]) => ({
        stateKey,
        stateLabel: stateKey ?? "No State",
        ...counts,
        total: counts.employeeFT + counts.employeePT + counts.ic + counts.blank,
      }))
      .sort((a, b) => {
        if (a.stateKey === null) return 1;
        if (b.stateKey === null) return -1;
        return a.stateKey.localeCompare(b.stateKey);
      });

    const totals = rows.reduce(
      (acc, r) => ({
        employeeFT: acc.employeeFT + r.employeeFT,
        employeePT: acc.employeePT + r.employeePT,
        ic: acc.ic + r.ic,
        blank: acc.blank + r.blank,
      }),
      { employeeFT: 0, employeePT: 0, ic: 0, blank: 0 }
    );

    return { rows, totals, total: filteredDist.length };
  }, [filteredDist]);

  const openDrill = (
    stateKey: string | null | "__all_states__",
    classKey: DrillFilter["classKey"],
    label: string
  ) => {
    setDrillFilter({
      stateKey: stateKey as string | null,
      classKey,
      label,
    });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg p-2 shadow-lg">
          <p className="text-sm font-medium">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">{payload[0].value} drivers</p>
        </div>
      );
    }
    return null;
  };

  // ── Clickable count button ────────────────────────────────────────────────

  const CountBtn = ({
    count,
    stateKey,
    classKey,
    label,
    variant = "default",
  }: {
    count: number;
    stateKey: string | null | "__all_states__";
    classKey: DrillFilter["classKey"];
    label: string;
    variant?: "default" | "blank" | "muted";
  }) => {
    if (count === 0) {
      return <span className="text-muted-foreground/40 text-sm tabular-nums">—</span>;
    }
    const cls =
      variant === "blank"
        ? "font-semibold text-amber-600 dark:text-amber-400 underline underline-offset-2 cursor-pointer hover:text-amber-700 dark:hover:text-amber-300 tabular-nums"
        : variant === "muted"
        ? "text-sm text-muted-foreground underline underline-offset-2 cursor-pointer hover:text-foreground tabular-nums"
        : "font-medium text-primary underline underline-offset-2 cursor-pointer hover:text-primary/80 tabular-nums";
    return (
      <button
        className={cls}
        onClick={() => openDrill(stateKey, classKey, label)}
        data-testid={`btn-drill-${String(stateKey)}-${classKey}`}
      >
        {count}
      </button>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <DashboardFilterBar />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Workforce Snapshot</h1>
            <p className="text-muted-foreground text-sm">Complete workforce overview and metrics</p>
          </div>
        </div>

        {/* ── Existing Workforce Snapshot ─────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-[300px]" />
              <Skeleton className="h-[300px]" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Drivers</p>
                      <p className="text-3xl font-bold">{workforceStats.total}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active</p>
                      <p className="text-3xl font-bold text-green-600">{workforceStats.byStatus.active}</p>
                      <p className="text-xs text-muted-foreground">
                        {workforceStats.total > 0
                          ? Math.round((workforceStats.byStatus.active / workforceStats.total) * 100)
                          : 0}% of total
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <UserCheck className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Inactive</p>
                      <p className="text-3xl font-bold text-muted-foreground">{workforceStats.byStatus.inactive}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                      <UserMinus className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Suspended</p>
                      <p className="text-3xl font-bold text-red-600">{workforceStats.byStatus.suspended}</p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <UserX className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5" />
                    Status Distribution
                  </CardTitle>
                  <CardDescription>Breakdown by current driver status</CardDescription>
                </CardHeader>
                <CardContent>
                  {workforceStats.statusData.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No driver data available
                    </div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={workforceStats.statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {workforceStats.statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Classification Breakdown
                  </CardTitle>
                  <CardDescription>W2 Employees vs Independent Contractors</CardDescription>
                </CardHeader>
                <CardContent>
                  {workforceStats.classificationData.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No classification data available
                    </div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={workforceStats.classificationData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {workforceStats.classificationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {funnel && funnel.stages && funnel.stages.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Workforce Funnel
                  </CardTitle>
                  <CardDescription>Driver lifecycle stages</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {funnel.stages.map((stage, idx) => {
                      const maxCount = Math.max(...funnel.stages.map((s) => s.count));
                      const percentage = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                      return (
                        <div key={stage.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium capitalize">{stage.label}</span>
                            <span className="text-muted-foreground">{stage.count} drivers</span>
                          </div>
                          <div className="h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: stage.color || COLORS[idx % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Quick Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">New Drivers (30 days)</span>
                    <Badge variant="secondary">{recentChanges.newThisMonth}</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Activation Rate</span>
                    <Badge className={
                      recentChanges.activationRate >= 80
                        ? "bg-green-500/10 text-green-600"
                        : recentChanges.activationRate >= 60
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-red-500/10 text-red-600"
                    }>
                      {recentChanges.activationRate}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">W2 Employees</span>
                    <Badge variant="outline">{workforceStats.byClassification.w2}</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Independent Contractors</span>
                    <Badge variant="outline">{workforceStats.byClassification.ic}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Quick Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link href="/drivers">
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-primary" />
                        <span className="font-medium">All Drivers</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </Link>
                  <Link href="/reports/drivers">
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <UserCheck className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Drivers Report</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </Link>
                  <Link href="/reports/compliance">
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <Building className="h-5 w-5 text-amber-600" />
                        <span className="font-medium">Compliance Report</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* ── Driver Distribution (Classification by State) ─────────── */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TableIcon className="h-5 w-5" />
                Driver Distribution — Classification by State
              </CardTitle>
              <CardDescription>
                Click any count to drill down into the underlying drivers. Use the inline dropdown to fix missing classifications.
              </CardDescription>
            </div>
            {pivot.totals.blank > 0 && (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
                {pivot.totals.blank} missing classification
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {distLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : pivot.rows.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                No driver data available for current filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28" rowSpan={2}>State</th>
                      <th className="text-center px-4 pt-2.5 pb-0 font-medium text-muted-foreground border-b-0" colSpan={2}>
                        Employee
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground" rowSpan={2}>
                        Ind. Contractor
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-amber-600 dark:text-amber-400" rowSpan={2}>
                        Not Set
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground" rowSpan={2}>
                        Total
                      </th>
                    </tr>
                    <tr className="border-b bg-muted/40">
                      <th className="text-center px-4 pb-2 font-medium text-muted-foreground/70 text-xs">Full Time</th>
                      <th className="text-center px-4 pb-2 font-medium text-muted-foreground/70 text-xs">Part Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.rows.map((row, idx) => (
                      <tr
                        key={row.stateKey ?? "__null__"}
                        className={`border-b last:border-0 transition-colors hover:bg-muted/20 ${
                          row.stateKey === null ? "bg-muted/10" : ""
                        }`}
                        data-testid={`pivot-row-${row.stateKey ?? "no-state"}`}
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {row.stateKey === null ? (
                            <span className="text-muted-foreground italic text-xs">No State</span>
                          ) : (
                            row.stateLabel
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CountBtn
                            count={row.employeeFT}
                            stateKey={row.stateKey}
                            classKey="Employee-FT"
                            label={`${row.stateLabel} — Employee (Full Time)`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CountBtn
                            count={row.employeePT}
                            stateKey={row.stateKey}
                            classKey="Employee-PT"
                            label={`${row.stateLabel} — Employee (Part Time)`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CountBtn
                            count={row.ic}
                            stateKey={row.stateKey}
                            classKey="Independent Contractor"
                            label={`${row.stateLabel} — Independent Contractor`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CountBtn
                            count={row.blank}
                            stateKey={row.stateKey}
                            classKey="__blank__"
                            label={`${row.stateLabel} — Not Set (Missing Classification)`}
                            variant="blank"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <CountBtn
                            count={row.total}
                            stateKey={row.stateKey}
                            classKey="__all__"
                            label={`${row.stateLabel} — All Drivers`}
                            variant="muted"
                          />
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="px-4 py-2.5 text-sm">Totals</td>
                      <td className="px-4 py-2.5 text-center">
                        <CountBtn
                          count={pivot.totals.employeeFT}
                          stateKey="__all_states__"
                          classKey="Employee-FT"
                          label="All States — Employee (Full Time)"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <CountBtn
                          count={pivot.totals.employeePT}
                          stateKey="__all_states__"
                          classKey="Employee-PT"
                          label="All States — Employee (Part Time)"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <CountBtn
                          count={pivot.totals.ic}
                          stateKey="__all_states__"
                          classKey="Independent Contractor"
                          label="All States — Independent Contractor"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <CountBtn
                          count={pivot.totals.blank}
                          stateKey="__all_states__"
                          classKey="__blank__"
                          label="All States — Not Set (Missing Classification)"
                          variant="blank"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <CountBtn
                          count={pivot.total}
                          stateKey="__all_states__"
                          classKey="__all__"
                          label="All States — All Drivers"
                          variant="muted"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Drill-down modal ─────────────────────────────────────────── */}
      <DrillDownModal
        open={drillFilter !== null}
        filter={drillFilter}
        drivers={filteredDist}
        onClose={() => setDrillFilter(null)}
      />
    </div>
  );
}
