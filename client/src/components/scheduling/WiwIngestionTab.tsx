import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Upload, FileSpreadsheet, Clock, Users, MapPin, AlertTriangle,
  CheckCircle2, XCircle, Loader2, TrendingUp, BarChart3,
  Calendar, Download, RefreshCw, Eye, ChevronRight, Timer,
  UserX, Building2, Briefcase, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { fmtTimeInTz } from "@/lib/timezoneUtils";

function StatCard({ title, value, subtitle, icon: Icon, variant = "default" }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  variant?: "default" | "warning" | "danger" | "success";
}) {
  const variantClasses = {
    default: "text-foreground",
    warning: "text-yellow-600 dark:text-yellow-400",
    danger: "text-red-600 dark:text-red-400",
    success: "text-green-600 dark:text-green-400",
  };
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${variantClasses[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variantClasses[variant]}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function ImportUploadPanel() {
  const { toast } = useToast();
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const attendanceFileRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  const validateFile = (file: File, allowedExts: string[]): string | null => {
    if (file.size > MAX_FILE_SIZE) return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 25MB.`;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExts.includes(ext)) return `Invalid file type. Allowed: ${allowedExts.join(', ')}`;
    return null;
  };

  const scheduleMutation = useMutation({
    mutationFn: async (file: File) => {
      const error = validateFile(file, ['xlsx', 'xls']);
      if (error) throw new Error(error);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/scheduling/wiw/import/schedule", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Schedule imported", description: `${data.totalRows} rows processed. ${data.matched} employees matched, ${data.unmatched} unmatched.` });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/schedule-vs-actual"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async (file: File) => {
      const error = validateFile(file, ['csv', 'xlsx', 'xls']);
      if (error) throw new Error(error);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/scheduling/wiw/import/attendance", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Attendance data imported", description: `${data.totalRows} rows processed. ${data.matched} employees matched, ${data.unmatched} unmatched.` });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/schedule-vs-actual"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card data-testid="card-schedule-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Schedule Import (XLSX)
          </CardTitle>
          <CardDescription>
            Upload a When I Work schedule export (.xlsx) to import shift data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={scheduleFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="input-schedule-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) scheduleMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => scheduleFileRef.current?.click()}
            disabled={scheduleMutation.isPending}
            className="w-full"
            data-testid="button-upload-schedule"
          >
            {scheduleMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Upload Schedule XLSX</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-attendance-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Attendance Notices (CSV)
          </CardTitle>
          <CardDescription>
            Upload attendance notice exports (.csv, .xlsx) with late/missed punch data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={attendanceFileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            data-testid="input-attendance-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attendanceMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => attendanceFileRef.current?.click()}
            disabled={attendanceMutation.isPending}
            className="w-full"
            data-testid="button-upload-attendance"
          >
            {attendanceMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Upload Attendance CSV</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportHistory() {
  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/wiw/import-runs"],
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: runDetail } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/import-runs", selectedRun],
    enabled: !!selectedRun,
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300",
      processing: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300",
      failed: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300",
      partial: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300",
      pending: "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300",
    };
    return <Badge className={variants[status] || variants.pending}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-import-history">
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>Previous file imports and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {(!runs || runs.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">No imports yet. Upload a schedule or attendance file above.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {runs.map((run: any) => (
                  <div
                    key={run.id}
                    className={`flex items-center justify-between gap-2 p-3 rounded-md border cursor-pointer hover-elevate ${selectedRun === run.id ? 'border-primary bg-muted/50' : ''}`}
                    onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}
                    data-testid={`import-run-${run.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {run.importType === "schedule" ? (
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{run.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(run.createdAt), "MMM d, yyyy h:mm a")} · {run.totalRows} rows
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-muted text-muted-foreground">{run.importType}</Badge>
                      {statusBadge(run.status)}
                      <ChevronRight className={`h-4 w-4 transition-transform ${selectedRun === run.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {selectedRun && runDetail && (
        <Card data-testid="card-import-detail">
          <CardHeader>
            <CardTitle className="text-base">Import Detail: {runDetail.fileName}</CardTitle>
            <CardDescription>
              {runDetail.processedRows} processed · {runDetail.matchedEmployees} matched · {runDetail.unmatchedEmployees} unmatched
              {runDetail.dateRangeStart && ` · ${runDetail.dateRangeStart} to ${runDetail.dateRangeEnd}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              {runDetail.scheduleRows?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Employee</th>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Hours</th>
                        <th className="text-left p-2 font-medium">Position</th>
                        <th className="text-left p-2 font-medium">Location</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runDetail.scheduleRows.slice(0, 50).map((row: any) => (
                        <tr key={row.id} className="border-b border-muted">
                          <td className="p-2">{row.employeeName || "—"}</td>
                          <td className="p-2">{row.shiftDate || "—"}</td>
                          <td className="p-2">{row.scheduledHours || "—"}</td>
                          <td className="p-2">{row.position || "—"}</td>
                          <td className="p-2">{row.locationName || "—"}</td>
                          <td className="p-2">
                            {row.matchStatus === "matched" ? (
                              <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">Matched</Badge>
                            ) : (
                              <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300">Unmatched</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {runDetail.attendanceRows?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Employee</th>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Actual Hours</th>
                        <th className="text-left p-2 font-medium">Variance</th>
                        <th className="text-left p-2 font-medium">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runDetail.attendanceRows.slice(0, 50).map((row: any) => (
                        <tr key={row.id} className="border-b border-muted">
                          <td className="p-2">{row.employeeName || "—"}</td>
                          <td className="p-2">{row.noticeDate || "—"}</td>
                          <td className="p-2">
                            <Badge className={
                              row.noticeType === "late" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300" :
                              row.noticeType === "no_show" ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300" :
                              row.noticeType === "missed_punch" ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300" :
                              "bg-muted text-muted-foreground"
                            }>{row.noticeType?.replace(/_/g, " ") || "other"}</Badge>
                          </td>
                          <td className="p-2">{row.actualHours || "—"}</td>
                          <td className="p-2">{row.varianceMinutes != null ? `${row.varianceMinutes} min` : "—"}</td>
                          <td className="p-2">{row.locationName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardOverview() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  const qs = queryParams.toString();

  const { data: dashboard, isLoading } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/dashboard", qs],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wiw/dashboard${qs ? `?${qs}` : ''}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!dashboard) return <p className="text-sm text-muted-foreground text-center py-8">No data available. Import schedule and attendance files first.</p>;

  const { schedule, attendance, locationRollup, roleRollup, overtimeEmployees, attendanceByEmployee, attendanceByLocation, dailySchedule } = dashboard;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" data-testid="input-date-from" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" data-testid="input-date-to" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} data-testid="button-clear-filters">
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Shifts" value={schedule?.totalShifts || 0} icon={Calendar} subtitle="Imported schedule rows" />
        <StatCard title="Scheduled Hours" value={Number(schedule?.totalScheduledHours || 0).toFixed(1)} icon={Timer} subtitle="Total planned hours" />
        <StatCard title="Unique Employees" value={schedule?.uniqueEmployees || 0} icon={Users} />
        <StatCard title="Locations" value={schedule?.uniqueLocations || 0} icon={Building2} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Attendance Notices" value={attendance?.totalNotices || 0} icon={AlertTriangle} variant={Number(attendance?.totalNotices) > 0 ? "warning" : "default"} />
        <StatCard title="Late Arrivals" value={attendance?.lateCount || 0} icon={Clock} variant={Number(attendance?.lateCount) > 0 ? "warning" : "default"} />
        <StatCard title="Missed Punches" value={attendance?.missedPunchCount || 0} icon={AlertCircle} variant={Number(attendance?.missedPunchCount) > 0 ? "danger" : "default"} />
        <StatCard title="No Shows" value={attendance?.noShowCount || 0} icon={UserX} variant={Number(attendance?.noShowCount) > 0 ? "danger" : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-overtime-employees">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Overtime Employees (&gt;40 hrs)
            </CardTitle>
            <CardDescription>Employees exceeding standard weekly hours</CardDescription>
          </CardHeader>
          <CardContent>
            {(!overtimeEmployees || overtimeEmployees.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No overtime detected</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {overtimeEmployees.map((emp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <div>
                        <p className="text-sm font-medium">{emp.employeeName || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{emp.locationName || "—"} · {emp.shiftCount} shifts</p>
                      </div>
                      <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">
                        {Number(emp.totalHours).toFixed(1)} hrs
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-attendance-by-employee">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Attendance Exceptions by Employee
            </CardTitle>
            <CardDescription>Employees with most attendance notices</CardDescription>
          </CardHeader>
          <CardContent>
            {(!attendanceByEmployee || attendanceByEmployee.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No attendance data</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {attendanceByEmployee.map((emp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <div>
                        <p className="text-sm font-medium">{emp.employeeName || "Unknown"}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {Number(emp.lateCount) > 0 && <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300">{emp.lateCount} late</Badge>}
                          {Number(emp.missedPunchCount) > 0 && <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300">{emp.missedPunchCount} missed</Badge>}
                          {Number(emp.noShowCount) > 0 && <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">{emp.noShowCount} no-show</Badge>}
                        </div>
                      </div>
                      <Badge className="bg-muted text-muted-foreground">{emp.totalNotices} total</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-location-rollup">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Schedule by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!locationRollup || locationRollup.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No location data</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {locationRollup.map((loc: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <div>
                        <p className="text-sm font-medium">{loc.locationName || "Unassigned"}</p>
                        <p className="text-xs text-muted-foreground">{loc.uniqueEmployees} employees · {loc.shiftCount} shifts</p>
                      </div>
                      <Badge className="bg-muted text-muted-foreground">{Number(loc.totalHours).toFixed(0)} hrs</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-role-rollup">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Schedule by Role / Position
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!roleRollup || roleRollup.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No role data</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {roleRollup.map((role: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <div>
                        <p className="text-sm font-medium">{role.position || "Unspecified"}</p>
                        <p className="text-xs text-muted-foreground">{role.uniqueEmployees} employees · {role.shiftCount} shifts</p>
                      </div>
                      <Badge className="bg-muted text-muted-foreground">{Number(role.totalHours).toFixed(0)} hrs</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {attendanceByLocation && attendanceByLocation.length > 0 && (
        <Card data-testid="card-attendance-by-location">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Attendance Exceptions by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {attendanceByLocation.map((loc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                    <div>
                      <p className="text-sm font-medium">{loc.locationName || "Unknown"}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {Number(loc.lateCount) > 0 && <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300">{loc.lateCount} late</Badge>}
                        {Number(loc.noShowCount) > 0 && <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">{loc.noShowCount} no-show</Badge>}
                        {Number(loc.missedPunchCount) > 0 && <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300">{loc.missedPunchCount} missed</Badge>}
                      </div>
                    </div>
                    <Badge className="bg-muted text-muted-foreground">{loc.totalNotices} total</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {dailySchedule && dailySchedule.length > 0 && (
        <Card data-testid="card-daily-schedule">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Schedule Summary
            </CardTitle>
            <CardDescription>Shift count and hours by day</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-right p-2 font-medium">Shifts</th>
                      <th className="text-right p-2 font-medium">Total Hours</th>
                      <th className="text-right p-2 font-medium">Employees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySchedule.map((day: any, i: number) => (
                      <tr key={i} className="border-b border-muted">
                        <td className="p-2">{day.date}</td>
                        <td className="p-2 text-right">{day.shiftCount}</td>
                        <td className="p-2 text-right">{Number(day.totalHours).toFixed(1)}</td>
                        <td className="p-2 text-right">{day.uniqueEmployees}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardFilterBar({ dateFrom, setDateFrom, dateTo, setDateTo, locationName, setLocationName, roleName, setRoleName, employeeName, setEmployeeName, showRole = true }: {
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  locationName?: string; setLocationName?: (v: string) => void;
  roleName?: string; setRoleName?: (v: string) => void;
  employeeName?: string; setEmployeeName?: (v: string) => void;
  showRole?: boolean;
}) {
  const hasFilters = dateFrom || dateTo || locationName || roleName || employeeName;
  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="dashboard-filter-bar">
      <div className="flex items-center gap-2">
        <Label className="text-sm whitespace-nowrap">From</Label>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" data-testid="input-filter-date-from" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-sm whitespace-nowrap">To</Label>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" data-testid="input-filter-date-to" />
      </div>
      {setLocationName !== undefined && (
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Location</Label>
          <Input type="text" placeholder="Filter..." value={locationName || ""} onChange={e => setLocationName!(e.target.value)} className="w-36" data-testid="input-filter-location" />
        </div>
      )}
      {showRole && setRoleName !== undefined && (
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Role</Label>
          <Input type="text" placeholder="Filter..." value={roleName || ""} onChange={e => setRoleName!(e.target.value)} className="w-36" data-testid="input-filter-role" />
        </div>
      )}
      {setEmployeeName !== undefined && (
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Employee</Label>
          <Input type="text" placeholder="Filter..." value={employeeName || ""} onChange={e => setEmployeeName!(e.target.value)} className="w-36" data-testid="input-filter-employee" />
        </div>
      )}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setLocationName?.(""); setRoleName?.(""); setEmployeeName?.(""); }} data-testid="button-clear-dashboard-filters">
          Clear
        </Button>
      )}
    </div>
  );
}

function ScheduleVsActualDashboard() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationName, setLocationName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (locationName) queryParams.set("locationName", locationName);
  if (roleName) queryParams.set("roleName", roleName);
  if (employeeName) queryParams.set("employeeName", employeeName);
  queryParams.set("groupBy", groupBy);
  const qs = queryParams.toString();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/dashboard/schedule-vs-actual", qs],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wiw/dashboard/schedule-vs-actual?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const totals = data?.totals || {};
  const byPeriod = data?.byPeriod || [];
  const byEmployee = data?.byEmployee || [];
  const totalScheduled = Number(totals.total_scheduled || 0);
  const totalActual = Number(totals.total_actual || 0);
  const totalVariance = Number(totals.total_variance || 0);

  return (
    <div className="space-y-6" data-testid="schedule-vs-actual-dashboard">
      <DashboardFilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        locationName={locationName} setLocationName={setLocationName}
        roleName={roleName} setRoleName={setRoleName}
        employeeName={employeeName} setEmployeeName={setEmployeeName}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Scheduled Hours" value={totalScheduled.toFixed(1)} icon={Timer} subtitle="Total planned" />
        <StatCard title="Actual Hours" value={totalActual.toFixed(1)} icon={Clock} subtitle="Total worked" />
        <StatCard
          title="Total Variance"
          value={`${totalVariance >= 0 ? "+" : ""}${totalVariance.toFixed(1)} hrs`}
          icon={TrendingUp}
          variant={Math.abs(totalVariance) > 10 ? "danger" : Math.abs(totalVariance) > 3 ? "warning" : "success"}
          subtitle="Actual minus scheduled"
        />
        <StatCard title="Reconciled Records" value={Number(totals.total_records || 0)} icon={CheckCircle2} subtitle={`${Number(totals.late_starts || 0)} late starts`} />
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Group by:</Label>
        <Button variant={groupBy === "day" ? "default" : "outline"} size="sm" onClick={() => setGroupBy("day")} data-testid="button-group-day">Day</Button>
        <Button variant={groupBy === "week" ? "default" : "outline"} size="sm" onClick={() => setGroupBy("week")} data-testid="button-group-week">Week</Button>
      </div>

      <Card data-testid="card-sva-by-period">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Hours by {groupBy === "week" ? "Week" : "Day"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byPeriod.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No reconciled data yet. Import schedule and attendance files, then run reconciliation.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">{groupBy === "week" ? "Week Starting" : "Date"}</th>
                      <th className="text-right p-2 font-medium">Records</th>
                      <th className="text-right p-2 font-medium">Scheduled</th>
                      <th className="text-right p-2 font-medium">Actual</th>
                      <th className="text-right p-2 font-medium">Variance</th>
                      <th className="text-right p-2 font-medium">Avg Start Var</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPeriod.map((row: any, i: number) => {
                      const scheduled = Number(row.total_scheduled_hours || 0);
                      const actual = Number(row.total_actual_hours || 0);
                      const variance = Number(row.variance_hours || 0);
                      const avgVar = Number(row.avg_variance_minutes || 0);
                      return (
                        <tr key={i} className="border-b border-muted" data-testid={`row-sva-period-${i}`}>
                          <td className="p-2 font-medium">{row.period}</td>
                          <td className="p-2 text-right">{row.record_count}</td>
                          <td className="p-2 text-right">{scheduled.toFixed(1)}</td>
                          <td className="p-2 text-right">{actual.toFixed(1)}</td>
                          <td className="p-2 text-right">
                            <span className={variance > 2 ? "text-blue-600 dark:text-blue-400" : variance < -2 ? "text-red-600 dark:text-red-400" : ""}>
                              {variance >= 0 ? "+" : ""}{variance.toFixed(1)} hrs
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <span className={avgVar > 15 ? "text-red-600 dark:text-red-400" : avgVar > 5 ? "text-yellow-600 dark:text-yellow-400" : ""}>
                              {avgVar.toFixed(0)} min
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-sva-by-employee">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Variance by Employee
          </CardTitle>
          <CardDescription>Individual employee schedule vs actual comparison</CardDescription>
        </CardHeader>
        <CardContent>
          {byEmployee.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No employee data available</p>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Location</th>
                      <th className="text-left p-2 font-medium">Role</th>
                      <th className="text-right p-2 font-medium">Shifts</th>
                      <th className="text-right p-2 font-medium">Scheduled</th>
                      <th className="text-right p-2 font-medium">Actual</th>
                      <th className="text-right p-2 font-medium">Variance</th>
                      <th className="text-right p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map((row: any, i: number) => {
                      const scheduled = Number(row.total_scheduled_hours || 0);
                      const actual = Number(row.total_actual_hours || 0);
                      const variance = Number(row.variance_hours || 0);
                      const pctDiff = scheduled > 0 ? Math.abs(variance / scheduled * 100) : 0;
                      return (
                        <tr key={i} className="border-b border-muted" data-testid={`row-sva-employee-${i}`}>
                          <td className="p-2 font-medium">{row.employee_name}</td>
                          <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                          <td className="p-2 text-muted-foreground">{row.position || "—"}</td>
                          <td className="p-2 text-right">{row.shift_count}</td>
                          <td className="p-2 text-right">{scheduled.toFixed(1)}</td>
                          <td className="p-2 text-right">{actual.toFixed(1)}</td>
                          <td className="p-2 text-right">
                            <span className={variance > 2 ? "text-blue-600 dark:text-blue-400" : variance < -2 ? "text-red-600 dark:text-red-400" : ""}>
                              {variance >= 0 ? "+" : ""}{variance.toFixed(1)} hrs
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            {pctDiff <= 5 ? (
                              <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">On Track</Badge>
                            ) : pctDiff <= 15 ? (
                              <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300">Minor</Badge>
                            ) : (
                              <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">Significant</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OvertimeWatchDashboard() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [threshold, setThreshold] = useState(40);

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  queryParams.set("threshold", String(threshold));
  const qs = queryParams.toString();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/dashboard/overtime-watch", qs],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wiw/dashboard/overtime-watch?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const summary = data?.summary || {};
  const weeklyBreakdown = data?.weeklyBreakdown || [];
  const overtimeRows = weeklyBreakdown.filter((r: any) => r.over_threshold);
  const regularRows = weeklyBreakdown.filter((r: any) => !r.over_threshold);

  return (
    <div className="space-y-6" data-testid="overtime-watch-dashboard">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" data-testid="input-ot-date-from" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" data-testid="input-ot-date-to" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Threshold (hrs)</Label>
          <Input type="number" min={1} max={80} value={threshold} onChange={e => setThreshold(Number(e.target.value) || 40)} className="w-20" data-testid="input-ot-threshold" />
        </div>
        {(dateFrom || dateTo || threshold !== 40) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setThreshold(40); }} data-testid="button-clear-ot-filters">
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Employees" value={Number(summary.total_employees || 0)} icon={Users} subtitle={`Across ${Number(summary.total_weeks || 0)} weeks`} />
        <StatCard
          title="Overtime Instances"
          value={Number(summary.overtime_instances || 0)}
          icon={AlertTriangle}
          variant={Number(summary.overtime_instances || 0) > 0 ? "danger" : "success"}
          subtitle={`${Number(summary.employees_with_overtime || 0)} employees affected`}
        />
        <StatCard
          title="Total OT Hours"
          value={Number(summary.total_overtime_hours || 0).toFixed(1)}
          icon={Clock}
          variant={Number(summary.total_overtime_hours || 0) > 0 ? "warning" : "default"}
          subtitle={`Over ${threshold}-hr threshold`}
        />
        <StatCard title="Avg Weekly Hours" value={Number(summary.avg_weekly_hours || 0).toFixed(1)} icon={Timer} subtitle={`Max: ${Number(summary.max_weekly_hours || 0).toFixed(1)} hrs`} />
      </div>

      <Card data-testid="card-overtime-flagged">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Flagged: Over {threshold} Hours
          </CardTitle>
          <CardDescription>Employee-weeks exceeding the overtime threshold</CardDescription>
        </CardHeader>
        <CardContent>
          {overtimeRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No overtime detected with current filters.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Week Starting</th>
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Location</th>
                      <th className="text-left p-2 font-medium">Role</th>
                      <th className="text-right p-2 font-medium">Punches</th>
                      <th className="text-right p-2 font-medium">Total Hours</th>
                      <th className="text-right p-2 font-medium">OT Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overtimeRows.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-muted" data-testid={`row-overtime-${i}`}>
                        <td className="p-2">{row.week_start}</td>
                        <td className="p-2 font-medium">{row.employee_name}</td>
                        <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                        <td className="p-2 text-muted-foreground">{row.position || "—"}</td>
                        <td className="p-2 text-right">{row.punch_count}</td>
                        <td className="p-2 text-right">
                          <span className="text-red-600 dark:text-red-400 font-medium">{Number(row.total_hours).toFixed(1)}</span>
                        </td>
                        <td className="p-2 text-right">
                          <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">
                            +{Number(row.overtime_hours).toFixed(1)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-weekly-all">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            All Weekly Hours
          </CardTitle>
          <CardDescription>Complete weekly hours breakdown by employee</CardDescription>
        </CardHeader>
        <CardContent>
          {weeklyBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No time punch data available. Import attendance files first.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Week Starting</th>
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Location</th>
                      <th className="text-right p-2 font-medium">Punches</th>
                      <th className="text-right p-2 font-medium">Total Hours</th>
                      <th className="text-right p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyBreakdown.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-muted" data-testid={`row-weekly-${i}`}>
                        <td className="p-2">{row.week_start}</td>
                        <td className="p-2 font-medium">{row.employee_name}</td>
                        <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                        <td className="p-2 text-right">{row.punch_count}</td>
                        <td className="p-2 text-right">{Number(row.total_hours).toFixed(1)}</td>
                        <td className="p-2 text-right">
                          {row.over_threshold ? (
                            <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">Over {threshold}h</Badge>
                          ) : Number(row.total_hours) > threshold * 0.9 ? (
                            <Badge className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300">Near Limit</Badge>
                          ) : (
                            <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceExceptionsDashboard() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationName, setLocationName] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (locationName) queryParams.set("locationName", locationName);
  if (employeeName) queryParams.set("employeeName", employeeName);
  const qs = queryParams.toString();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/scheduling/wiw/dashboard/attendance-exceptions", qs],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wiw/dashboard/attendance-exceptions?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const summary = data?.summary || {};
  const lateClockIns = data?.lateClockIns || [];
  const missedPunches = data?.missedPunches || [];
  const unmatchedPunches = data?.unmatchedPunches || [];

  return (
    <div className="space-y-6" data-testid="attendance-exceptions-dashboard">
      <DashboardFilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        locationName={locationName} setLocationName={setLocationName}
        employeeName={employeeName} setEmployeeName={setEmployeeName}
        showRole={false}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Exceptions" value={Number(summary.total_exceptions || 0)} icon={AlertTriangle}
          variant={Number(summary.total_exceptions || 0) > 0 ? "warning" : "default"} subtitle={`Of ${Number(summary.total_punches || 0)} punches`} />
        <StatCard title="Late Arrivals" value={Number(summary.late_count || 0)} icon={Clock}
          variant={Number(summary.late_count || 0) > 0 ? "warning" : "default"} />
        <StatCard title="Missed Punches" value={Number(summary.missed_punch_count || 0) + Number(summary.incomplete_punches || 0)} icon={AlertCircle}
          variant={Number(summary.missed_punch_count || 0) > 0 ? "danger" : "default"} subtitle="Missing clock in or out" />
        <StatCard title="Unmatched Punches" value={Number(summary.unmatchedCount || 0)} icon={XCircle}
          variant={Number(summary.unmatchedCount || 0) > 0 ? "danger" : "default"} subtitle="No matching shift found" />
      </div>

      <Card data-testid="card-late-clock-ins">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-500" />
            Late Clock-Ins
          </CardTitle>
          <CardDescription>Employees who clocked in more than 5 minutes after scheduled start</CardDescription>
        </CardHeader>
        <CardContent>
          {lateClockIns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No late clock-ins detected with current filters.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Scheduled</th>
                      <th className="text-left p-2 font-medium">Actual</th>
                      <th className="text-right p-2 font-medium">Late By</th>
                      <th className="text-left p-2 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateClockIns.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-muted" data-testid={`row-late-${i}`}>
                        <td className="p-2 font-medium">{row.employee_name}</td>
                        <td className="p-2">{row.punch_date}</td>
                        <td className="p-2 text-muted-foreground">{fmtTimeInTz(row.scheduled_start, row.location_timezone)}</td>
                        <td className="p-2 text-muted-foreground">{fmtTimeInTz(row.actual_start, row.location_timezone)}</td>
                        <td className="p-2 text-right">
                          <Badge className={Number(row.variance_minutes) > 30 ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300" : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300"}>
                            {Number(row.variance_minutes)} min
                          </Badge>
                        </td>
                        <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-missed-punches">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Missed / Incomplete Punches
          </CardTitle>
          <CardDescription>Punches missing clock-in or clock-out with noted exceptions</CardDescription>
        </CardHeader>
        <CardContent>
          {missedPunches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No missed punches detected.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Clock In</th>
                      <th className="text-left p-2 font-medium">Clock Out</th>
                      <th className="text-left p-2 font-medium">Exception</th>
                      <th className="text-left p-2 font-medium">Details</th>
                      <th className="text-left p-2 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missedPunches.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-muted" data-testid={`row-missed-${i}`}>
                        <td className="p-2 font-medium">{row.employee_name}</td>
                        <td className="p-2">{row.punch_date}</td>
                        <td className="p-2">{row.clock_in ? fmtTimeInTz(row.clock_in, row.location_timezone) : <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">Missing</Badge>}</td>
                        <td className="p-2">{row.clock_out ? fmtTimeInTz(row.clock_out, row.location_timezone) : <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300">Missing</Badge>}</td>
                        <td className="p-2">
                          <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300">{row.exception_type || "Unknown"}</Badge>
                        </td>
                        <td className="p-2 text-muted-foreground text-xs max-w-[200px] truncate">{row.exception_details || "—"}</td>
                        <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-unmatched-punches">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            Unmatched Punches
          </CardTitle>
          <CardDescription>Time punches with no corresponding shift in the schedule</CardDescription>
        </CardHeader>
        <CardContent>
          {unmatchedPunches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">All punches are matched to shifts.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Employee</th>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Clock In</th>
                      <th className="text-left p-2 font-medium">Clock Out</th>
                      <th className="text-right p-2 font-medium">Hours</th>
                      <th className="text-left p-2 font-medium">Exception</th>
                      <th className="text-left p-2 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedPunches.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-muted" data-testid={`row-unmatched-${i}`}>
                        <td className="p-2 font-medium">{row.employee_name}</td>
                        <td className="p-2">{row.punch_date}</td>
                        <td className="p-2">{fmtTimeInTz(row.clock_in, row.location_timezone)}</td>
                        <td className="p-2">{fmtTimeInTz(row.clock_out, row.location_timezone)}</td>
                        <td className="p-2 text-right">{row.worked_hours ? Number(row.worked_hours).toFixed(1) : "—"}</td>
                        <td className="p-2">
                          {row.exception_type ? <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300">{row.exception_type}</Badge> : "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{row.location_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SeedSampleDataButton() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scheduling/wiw/seed-sample");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Sample data imported", description: data.message || "Dashboards are now populated with sample When I Work data." });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard/schedule-vs-actual"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard/overtime-watch"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw/dashboard/attendance-exceptions"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message || "Could not import sample data.", variant: "destructive" });
    },
  });

  if (!isAdmin) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => seedMutation.mutate()}
      disabled={seedMutation.isPending}
      data-testid="button-seed-sample-wiw"
    >
      {seedMutation.isPending ? (
        <><Loader2 className="h-4 w-4 animate-spin" /><span>Importing...</span></>
      ) : (
        <><Download className="h-4 w-4" /><span>Import Sample WIW Data</span></>
      )}
    </Button>
  );
}

export default function WiwIngestionTab() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canImport = isSuperAdmin || isRootSuperAdmin;

  return (
    <div className="space-y-6 p-1" data-testid="wiw-ingestion-tab">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">When I Work Data Ingestion</h2>
          <p className="text-sm text-muted-foreground">
            Import schedule and attendance exports for reporting and reconciliation
          </p>
        </div>
        <SeedSampleDataButton />
      </div>

      {canImport && <ImportUploadPanel />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="wiw-tabs" className="flex-wrap">
          <TabsTrigger value="dashboard" data-testid="tab-wiw-dashboard">Overview</TabsTrigger>
          <TabsTrigger value="schedule-vs-actual" data-testid="tab-wiw-sva">Schedule vs Actual</TabsTrigger>
          <TabsTrigger value="overtime-watch" data-testid="tab-wiw-overtime">Overtime Watch</TabsTrigger>
          <TabsTrigger value="attendance-exceptions" data-testid="tab-wiw-exceptions">Attendance Exceptions</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-wiw-history">Import History</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardOverview />
        </TabsContent>

        <TabsContent value="schedule-vs-actual">
          <ScheduleVsActualDashboard />
        </TabsContent>

        <TabsContent value="overtime-watch">
          <OvertimeWatchDashboard />
        </TabsContent>

        <TabsContent value="attendance-exceptions">
          <AttendanceExceptionsDashboard />
        </TabsContent>

        <TabsContent value="history">
          <ImportHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}