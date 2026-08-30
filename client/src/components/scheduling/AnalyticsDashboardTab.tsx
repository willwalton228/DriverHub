import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Users, Clock, AlertTriangle, TrendingUp,
  Download, Calendar, MapPin, Briefcase, UserCheck,
  XCircle, Timer
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, subDays } from "date-fns";

interface AnalyticsSummary {
  fillRate: number;
  totalRequired: number;
  totalAssigned: number;
  totalShifts: number;
  overtimeHours: number;
  projectedOvertimeHours: number;
  noShowCount: number;
  lateStartCount: number;
  avgUtilization: number;
  driverCount: number;
}

interface DriverUtilization {
  userId: string;
  driverName: string;
  role: string;
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  totalShifts: number;
  noShowCount: number;
  completedShifts: number;
  utilizationPercent: number;
}

interface MissedShift {
  assignmentId: string;
  userId: string;
  driverName: string;
  shiftDate: string;
  shiftStartTime: string;
  locationName: string;
  role: string;
  type: "no_show" | "late_start";
  lateMinutes: number | null;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  utilizationByDriver: DriverUtilization[];
  missedShifts: MissedShift[];
  filters: {
    locations: { id: string; name: string }[];
    roles: string[];
  };
}

function KpiCard({ title, value, subtitle, icon: Icon, variant = "default" }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Clock;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const iconColors = {
    default: "text-muted-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className={`h-4 w-4 ${iconColors[variant]}`} />
          {title}
        </div>
        <p className="text-2xl font-bold mt-1" data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function generateCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (val: string | number | null) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headerLine = headers.map(escape).join(',');
  const bodyLines = rows.map(row => row.map(escape).join(','));
  return [headerLine, ...bodyLines].join('\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function AnalyticsDashboardTab() {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(today), 'yyyy-MM-dd'));
  const [locationId, setLocationId] = useState<string>('all');
  const [role, setRole] = useState<string>('all');
  const [utilizationSort, setUtilizationSort] = useState<'hours' | 'utilization' | 'overtime'>('hours');

  const queryParams = new URLSearchParams({ startDate, endDate, locationId, role }).toString();
  const analyticsQuery = useQuery<AnalyticsData>({
    queryKey: ['/api/corporate/scheduling/analytics', startDate, endDate, locationId, role],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/scheduling/analytics?${queryParams}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: !!startDate && !!endDate,
  });

  const data = analyticsQuery.data;
  const summary = data?.summary;
  const locations = data?.filters?.locations || [];
  const roles = data?.filters?.roles || [];

  const sortedUtilization = useMemo(() => {
    if (!data?.utilizationByDriver) return [];
    const arr = [...data.utilizationByDriver];
    if (utilizationSort === 'hours') arr.sort((a, b) => b.scheduledHours - a.scheduledHours);
    if (utilizationSort === 'utilization') arr.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
    if (utilizationSort === 'overtime') arr.sort((a, b) => b.overtimeHours - a.overtimeHours);
    return arr;
  }, [data?.utilizationByDriver, utilizationSort]);

  const setDateRange = (range: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'last30') => {
    let s: Date, e: Date;
    if (range === 'thisWeek') { s = startOfWeek(today); e = endOfWeek(today); }
    else if (range === 'lastWeek') { s = startOfWeek(addDays(today, -7)); e = endOfWeek(addDays(today, -7)); }
    else if (range === 'thisMonth') { s = startOfMonth(today); e = endOfMonth(today); }
    else { s = subDays(today, 30); e = today; }
    setStartDate(format(s, 'yyyy-MM-dd'));
    setEndDate(format(e, 'yyyy-MM-dd'));
  };

  const handleExportUtilization = () => {
    if (!sortedUtilization.length) return;
    const headers = ['Driver', 'Role', 'Scheduled Hours', 'Actual Hours', 'OT Hours', 'Total Shifts', 'No-Shows', 'Utilization %'];
    const rows = sortedUtilization.map(d => [
      d.driverName, d.role, d.scheduledHours, d.actualHours, d.overtimeHours,
      d.totalShifts, d.noShowCount, d.utilizationPercent,
    ]);
    const csv = generateCsv(headers, rows);
    downloadCsv(csv, `utilization-report-${startDate}-to-${endDate}.csv`);
  };

  const handleExportMissedShifts = () => {
    if (!data?.missedShifts?.length) return;
    const headers = ['Driver', 'Date', 'Start Time', 'Location', 'Role', 'Type', 'Late (min)'];
    const rows = data.missedShifts.map(m => [
      m.driverName,
      m.shiftDate,
      m.shiftStartTime ? format(new Date(m.shiftStartTime), 'h:mm a') : '',
      m.locationName,
      m.role,
      m.type === 'no_show' ? 'No-Show' : 'Late Start',
      m.lateMinutes,
    ]);
    const csv = generateCsv(headers, rows);
    downloadCsv(csv, `missed-shifts-${startDate}-to-${endDate}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="input-analytics-start-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-testid="input-analytics-end-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-[180px]" data-testid="select-analytics-location">
              <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[160px]" data-testid="select-analytics-role">
              <Briefcase className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setDateRange('thisWeek')} data-testid="button-this-week">
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateRange('lastWeek')} data-testid="button-last-week">
            Last Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateRange('thisMonth')} data-testid="button-this-month">
            This Month
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateRange('last30')} data-testid="button-last-30">
            Last 30 Days
          </Button>
        </div>
      </div>

      {analyticsQuery.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Fill Rate"
              value={`${summary.fillRate}%`}
              subtitle={`${summary.totalAssigned} / ${summary.totalRequired} positions filled`}
              icon={UserCheck}
              variant={summary.fillRate >= 90 ? "success" : summary.fillRate >= 70 ? "warning" : "danger"}
            />
            <KpiCard
              title="Overtime Hours"
              value={summary.overtimeHours.toFixed(1)}
              subtitle={`${summary.projectedOvertimeHours.toFixed(1)}h projected from schedules`}
              icon={Clock}
              variant={summary.overtimeHours > 0 ? "warning" : "default"}
            />
            <KpiCard
              title="Missed Shifts"
              value={summary.noShowCount + summary.lateStartCount}
              subtitle={`${summary.noShowCount} no-shows, ${summary.lateStartCount} late starts`}
              icon={XCircle}
              variant={summary.noShowCount > 0 ? "danger" : "default"}
            />
            <KpiCard
              title="Avg Utilization"
              value={`${summary.avgUtilization}%`}
              subtitle={`${summary.driverCount} drivers across ${summary.totalShifts} shifts`}
              icon={BarChart3}
              variant={summary.avgUtilization >= 70 ? "success" : summary.avgUtilization >= 40 ? "warning" : "default"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Utilization by Driver
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={utilizationSort} onValueChange={(v) => setUtilizationSort(v as any)}>
                    <SelectTrigger className="w-[130px]" data-testid="select-utilization-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">By Hours</SelectItem>
                      <SelectItem value="utilization">By Utilization</SelectItem>
                      <SelectItem value="overtime">By Overtime</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={handleExportUtilization} data-testid="button-export-utilization">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {sortedUtilization.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No driver data for this period</p>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {sortedUtilization.map((driver) => (
                      <div key={driver.userId} className="flex items-center gap-3" data-testid={`row-driver-${driver.userId}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{driver.driverName}</span>
                            {driver.role !== 'Unassigned' && (
                              <Badge variant="secondary" className="text-xs">{driver.role}</Badge>
                            )}
                            {driver.noShowCount > 0 && (
                              <Badge variant="destructive" className="text-xs">{driver.noShowCount} no-show</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <Progress value={driver.utilizationPercent} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground w-9 text-right">{driver.utilizationPercent}%</span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{driver.scheduledHours.toFixed(1)}h scheduled</span>
                            {driver.actualHours > 0 && <span>{driver.actualHours.toFixed(1)}h actual</span>}
                            {driver.overtimeHours > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">{driver.overtimeHours.toFixed(1)}h OT</span>
                            )}
                            <span>{driver.totalShifts} shifts</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  Missed Shifts & Late Starts
                </CardTitle>
                <Button variant="outline" size="icon" onClick={handleExportMissedShifts} data-testid="button-export-missed">
                  <Download className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {(!data?.missedShifts || data.missedShifts.length === 0) ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No missed shifts or late starts</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {data.missedShifts.map((item) => (
                      <div
                        key={item.assignmentId}
                        className="flex items-center gap-3 py-2 border-b last:border-0"
                        data-testid={`row-missed-${item.assignmentId}`}
                      >
                        {item.type === 'no_show' ? (
                          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <Timer className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{item.driverName}</span>
                            <Badge variant={item.type === 'no_show' ? 'destructive' : 'secondary'} className="text-xs">
                              {item.type === 'no_show' ? 'No-Show' : `Late ${item.lateMinutes}min`}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {item.shiftDate}
                            </span>
                            {item.shiftStartTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(item.shiftStartTime), 'h:mm a')}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {item.locationName}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Select a date range to view scheduling analytics</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
