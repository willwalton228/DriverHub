import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Employee, LeaveNotification } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Briefcase, Users, UserCheck, UserX, Loader2, Calendar, DollarSign, Building, ClipboardList, AlertTriangle, Clock, Bell, BellOff, CheckCheck, RefreshCw, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { EmailSummaryDialog } from "@/components/EmailSummaryDialog";
import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { LeaveWidgetsSection } from "./employees/LeaveWidgetsSection";

interface LeaveAlert {
  caseId: string;
  caseNumber: string;
  employeeName: string;
  employeeId: string;
  alertType: string;
  message: string;
  severity: string;
  dueDate: string | null;
}

interface ActiveLeaveCase {
  id: string;
  caseNumber: string;
  employeeId: string;
  leaveType: string;
  status: string;
  startDate: string | null;
  expectedReturnDate: string | null;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  cert_overdue:                 "Cert Overdue",
  cert_due_soon:                "Cert Due Soon",
  release_in_7_days:            "Return in 7 Days",
  release_in_3_days:            "Return in 3 Days",
  leave_exhaustion_approaching: "Leave Exhausting",
  return_to_work_recorded:      "Returned to Work",
  designation_not_sent:         "Designation Unsent",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  cfra: "CFRA", fmla: "FMLA", cfra_fmla: "CFRA+FMLA",
  ada: "ADA", military: "Military", bereavement: "Bereavement",
  workers_comp: "Workers' Comp", personal: "Personal", other: "Other",
};

export default function EmployeesDashboard() {
  const { toast } = useToast();
  const { isSuperAdmin, isCorporateAccessAdmin } = usePermissions();
  const canAdmin = isSuperAdmin || isCorporateAccessAdmin;

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/corporate/employees"],
  });

  const { data: leaveAlerts = [] } = useQuery<LeaveAlert[]>({
    queryKey: ["/api/corporate/leave-cases/alerts"],
    queryFn: () => fetch("/api/corporate/leave-cases/alerts").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: activeLeaveCases = [] } = useQuery<ActiveLeaveCase[]>({
    queryKey: ["/api/corporate/leave-cases/active"],
    queryFn: () => fetch("/api/corporate/leave-cases/active").then((r) => r.json()),
  });

  const { data: persistentNotifs = [], isLoading: notifsLoading } = useQuery<LeaveNotification[]>({
    queryKey: ["/api/corporate/leave-cases/notifications"],
    queryFn: () => fetch("/api/corporate/leave-cases/notifications").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/corporate/leave-cases/notifications/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases/notifications"] });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/leave-cases/scan-alerts").then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/leave-cases/notifications"] });
      toast({ title: `Scan complete — ${data.created ?? 0} new notification(s) created` });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const unreadNotifs = persistentNotifs.filter((n) => !n.isAcknowledged);

  const activeEmployees = employees.filter((e) => e.status === "active");
  const inactiveEmployees = employees.filter((e) => e.status === "inactive");
  const fullTimeEmployees = employees.filter((e) => e.employmentType === "Full Time");
  const partTimeEmployees = employees.filter((e) => e.employmentType === "Part Time");
  const exemptEmployees = employees.filter((e) => e.employeeType === "Exempt (Salaried)");
  const nonExemptEmployees = employees.filter((e) => e.employeeType === "Non-Exempt (Hourly)");

  const departmentCounts = employees.reduce((acc, emp) => {
    const dept = emp.department || "Unassigned";
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentHires = employees
    .filter((e) => e.hireDate)
    .sort((a, b) => (b.hireDate! > a.hireDate! ? 1 : b.hireDate! < a.hireDate! ? -1 : 0))
    .slice(0, 5);

  const summaryContent = `
EMPLOYEES SUMMARY
Total Employees: ${employees.length}
Active: ${activeEmployees.length}
Inactive: ${inactiveEmployees.length}

EMPLOYMENT TYPE:
Full Time: ${fullTimeEmployees.length}
Part Time: ${partTimeEmployees.length}

COMPENSATION TYPE:
Exempt (Salaried): ${exemptEmployees.length}
Non-Exempt (Hourly): ${nonExemptEmployees.length}

DEPARTMENTS:
${Object.entries(departmentCounts).map(([dept, count]) => `${dept}: ${count}`).join("\n")}

RECENT HIRES:
${recentHires.map((e) => `${e.firstName} ${e.lastName} - ${formatDate(e.hireDate)}`).join("\n")}
  `.trim();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Employees Dashboard</h1>
          <EmailSummaryDialog title="Employees" summaryContent={summaryContent} />
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of employee metrics and workforce statistics
        </p>
      </div>

      <ModuleDashboard moduleKey="employees" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/employees">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{employees.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/employees?status=active">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeEmployees.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently employed</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Full Time</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{fullTimeEmployees.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Full-time staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Part Time</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{partTimeEmployees.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Part-time staff</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Compensation Types
            </CardTitle>
            <CardDescription>Exempt vs Non-Exempt breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Exempt (Salaried)</p>
                  <p className="text-sm text-muted-foreground">Fixed salary employees</p>
                </div>
                <Badge>{exemptEmployees.length}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">Non-Exempt (Hourly)</p>
                  <p className="text-sm text-muted-foreground">Hourly wage employees</p>
                </div>
                <Badge>{nonExemptEmployees.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              By Department
            </CardTitle>
            <CardDescription>Employee distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(departmentCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between p-2 rounded-lg border">
                    <p className="font-medium">{dept}</p>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Hires
            </CardTitle>
            <CardDescription>Newest team members</CardDescription>
          </CardHeader>
          <CardContent>
            {recentHires.length > 0 ? (
              <div className="space-y-3">
                {recentHires.map((employee) => (
                  <Link key={employee.id} href={`/employees/${employee.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium">{employee.firstName} {employee.lastName}</p>
                        <p className="text-sm text-muted-foreground">
                          Hired: {formatDate(employee.hireDate)}
                        </p>
                      </div>
                      <Badge variant="outline">{employee.department || "N/A"}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No recent hires</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Leave Management Widgets ─────────────────────────────────────────── */}
      <LeaveWidgetsSection />

      {/* Leave Management Dashboard Widgets */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Active Leave Cases */}
        <Card data-testid="card-active-leave-cases">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Active Leave Cases
              {activeLeaveCases.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{activeLeaveCases.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Currently open CFRA / FMLA / Protected leave</CardDescription>
          </CardHeader>
          <CardContent>
            {activeLeaveCases.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active leave cases</p>
            ) : (
              <div className="space-y-2">
                {activeLeaveCases.slice(0, 5).map((lc) => (
                  <Link key={lc.id} href={`/employees/${lc.employeeId}`}>
                    <div className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`row-active-leave-${lc.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {lc.firstName} {lc.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{lc.caseNumber} · {LEAVE_TYPE_LABELS[lc.leaveType] ?? lc.leaveType}</p>
                      </div>
                      {lc.expectedReturnDate && (
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Return</p>
                          <p className="text-xs font-medium">{formatDate(lc.expectedReturnDate)}</p>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
                {activeLeaveCases.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{activeLeaveCases.length - 5} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leave Alerts */}
        <Card data-testid="card-leave-alerts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-5 w-5" />
              Leave Alerts
              {leaveAlerts.filter((a) => a.severity === "critical").length > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  {leaveAlerts.filter((a) => a.severity === "critical").length} critical
                </Badge>
              )}
              {leaveAlerts.filter((a) => a.severity === "warning").length > 0 && (
                <Badge variant="outline" className="text-yellow-700 border-yellow-400 dark:text-yellow-400">
                  {leaveAlerts.filter((a) => a.severity === "warning").length} warning
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Real-time compliance deadlines and return windows — click any alert to open the employee record</CardDescription>
          </CardHeader>
          <CardContent>
            {leaveAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active alerts</p>
            ) : (
              <div className="space-y-2">
                {leaveAlerts.slice(0, 8).map((alert, i) => (
                  <Link key={i} href={`/employees/${alert.employeeId}`}>
                    <div
                      className={`flex items-start gap-2.5 p-2.5 rounded-md text-sm border hover-elevate cursor-pointer ${
                        alert.severity === "critical"
                          ? "bg-destructive/10 border-destructive/20"
                          : alert.severity === "warning"
                          ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800/30"
                          : "bg-muted/50 border-transparent"
                      }`}
                      data-testid={`alert-leave-${i}`}
                    >
                      {alert.severity === "critical" ? (
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      ) : alert.severity === "warning" ? (
                        <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                      ) : (
                        <ClipboardList className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-xs">{alert.employeeName}</p>
                          <Badge variant="outline" className="text-xs py-0 h-4">
                            {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground">{alert.caseNumber}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
                {leaveAlerts.length > 8 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{leaveAlerts.length - 8} more alerts</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Persistent Leave Notification Center ───────────────────────────────── */}
      <Card data-testid="card-leave-notifications">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Leave Notification Center
                {unreadNotifs.length > 0 && (
                  <Badge variant="destructive" data-testid="badge-unread-notifs">{unreadNotifs.length} unread</Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Persistent alerts logged by the nightly compliance scan. Acknowledge to clear.
              </CardDescription>
            </div>
            {canAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
                data-testid="button-run-alert-scan"
              >
                {scanMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Run Scan Now
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {notifsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : persistentNotifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground" data-testid="text-no-notifications">
              <BellOff className="h-8 w-8 opacity-30" />
              <p className="text-sm">No notifications yet — the nightly scan runs at 6 AM, or use "Run Scan Now" above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {persistentNotifs.slice(0, 20).map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 p-3 rounded-md border text-sm transition-opacity ${
                    notif.isAcknowledged ? "opacity-50" : ""
                  } ${
                    notif.severity === "critical"
                      ? "bg-destructive/10 border-destructive/20"
                      : notif.severity === "warning"
                      ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800/30"
                      : "bg-muted/30 border-transparent"
                  }`}
                  data-testid={`notif-${notif.id}`}
                >
                  {notif.severity === "critical" ? (
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  ) : notif.severity === "warning" ? (
                    <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                  ) : (
                    <Bell className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="font-medium text-xs">{notif.employeeName}</span>
                      <Badge variant="outline" className="text-xs py-0 h-4">
                        {ALERT_TYPE_LABELS[notif.alertType] ?? notif.alertType}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{notif.caseNumber}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notif.createdAt ? new Date(notif.createdAt as string).toLocaleString() : ""}
                      {notif.isAcknowledged && notif.acknowledgedAt && (
                        <span className="ml-2 text-green-600 dark:text-green-400">
                          Acknowledged {new Date(notif.acknowledgedAt as string).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link href={`/employees/${notif.employeeId}`}>
                      <Button size="icon" variant="ghost" data-testid={`button-notif-go-${notif.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    {!notif.isAcknowledged && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => acknowledgeMutation.mutate(notif.id)}
                        disabled={acknowledgeMutation.isPending}
                        title="Acknowledge"
                        data-testid={`button-ack-${notif.id}`}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {persistentNotifs.length > 20 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Showing 20 of {persistentNotifs.length} notifications
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employee Directory
          </CardTitle>
          <CardDescription>Quick access to employee records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {employees.slice(0, 5).map((employee) => (
              <Link key={employee.id} href={`/employees/${employee.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{employee.firstName} {employee.lastName}</p>
                      <p className="text-sm text-muted-foreground">{employee.position || "Employee"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{employee.department || "N/A"}</Badge>
                    <StatusBadge status={employee.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
