import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DriverWithUser, Trip, Accident } from "@shared/schema";
import { WiwTimeOffWidget } from "@/components/scheduling/WiwTimeOffWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserCheck,
  UserX,
  Loader2,
  AlertTriangle,
  IdCard,
  TrendingUp,
  Calendar,
  Clock,
  CalendarOff,
  Timer,
  Download,
} from "lucide-react";
import { Link } from "wouter";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { EmailSummaryDialog } from "@/components/EmailSummaryDialog";
import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";
import * as XLSX from "xlsx";

// ── Attendance types ─────────────────────────────────────────────────────────

interface NoShowRecord {
  shiftId: string;
  driverId: string | null;
  driverName: string;
  scheduledStart: string;
  scheduledEnd: string;
  minutesPastStart?: number;
  shiftDate?: string;
  accountName: string | null;
  accountId: string | null;
}

interface LateRecord {
  shiftId: string;
  driverId: string | null;
  driverName: string;
  scheduledStart: string;
  clockIn: string;
  minutesLate: number;
  shiftDate?: string;
  accountName: string | null;
  accountId: string | null;
}

type AttendanceReportKey = "no-show-today" | "no-show-7days" | "late-today" | "late-7days" | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── Attendance report sheet ──────────────────────────────────────────────────

function AttendanceSheet({
  open,
  onClose,
  reportKey,
}: {
  open: boolean;
  onClose: () => void;
  reportKey: AttendanceReportKey;
}) {
  const isNoShowToday = reportKey === "no-show-today";
  const isNoShow7 = reportKey === "no-show-7days";
  const isLateToday = reportKey === "late-today";
  const isLate7 = reportKey === "late-7days";

  const { data: noShowToday = [], isLoading: loadingNST } = useQuery<NoShowRecord[]>({
    queryKey: ["/api/attendance/no-show-today"],
    enabled: isNoShowToday && open,
  });
  const { data: noShow7 = [], isLoading: loadingNS7 } = useQuery<NoShowRecord[]>({
    queryKey: ["/api/attendance/no-show-7days"],
    enabled: isNoShow7 && open,
  });
  const { data: lateToday = [], isLoading: loadingLT } = useQuery<LateRecord[]>({
    queryKey: ["/api/attendance/late-today"],
    enabled: isLateToday && open,
  });
  const { data: late7 = [], isLoading: loadingL7 } = useQuery<LateRecord[]>({
    queryKey: ["/api/attendance/late-7days"],
    enabled: isLate7 && open,
  });

  const titles: Record<NonNullable<AttendanceReportKey>, string> = {
    "no-show-today": "No Show Today",
    "no-show-7days": "No Show — Last 7 Days",
    "late-today": "Late Arrivals Today",
    "late-7days": "Late Arrivals — Last 7 Days",
  };

  const title = reportKey ? titles[reportKey] : "";
  const isLoading = loadingNST || loadingNS7 || loadingLT || loadingL7;

  const activeData: (NoShowRecord | LateRecord)[] = isNoShowToday
    ? noShowToday
    : isNoShow7
      ? noShow7
      : isLateToday
        ? lateToday
        : late7;

  const isNoShow = isNoShowToday || isNoShow7;
  const isMultiDay = isNoShow7 || isLate7;

  const handleExport = () => {
    if (!reportKey) return;
    const rows = (activeData as any[]).map((r) => {
      const base: Record<string, unknown> = {
        "Driver Name": r.driverName,
        Account: r.accountName || "",
      };
      if (isMultiDay) {
        base["Date"] = r.shiftDate ? formatShortDate(r.shiftDate) : "";
      }
      base["Scheduled Start"] = r.scheduledStart ? formatTime(r.scheduledStart) : "";
      if (!isNoShow) {
        base["Clock In"] = formatTime((r as LateRecord).clockIn);
        base["Minutes Late"] = Math.round((r as LateRecord).minutesLate);
      } else if (isNoShowToday) {
        base["Minutes Past Start"] = Math.round((r as NoShowRecord).minutesPastStart ?? 0);
      }
      return base;
    });
    exportToExcel(rows, reportKey);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            <Button
              variant="outline"
              size="default"
              onClick={handleExport}
              disabled={activeData.length === 0}
              data-testid="button-export-attendance"
            >
              <Download className="h-4 w-4 mr-2" />
              Export to Excel
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeData.length} infraction{activeData.length !== 1 ? "s" : ""}
            {" "}— drivers may appear multiple times
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <CalendarOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No infractions found</p>
              <p className="text-sm text-muted-foreground">No records match this period.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    {isMultiDay && <TableHead>Date</TableHead>}
                    <TableHead>Account</TableHead>
                    <TableHead>Scheduled Start</TableHead>
                    {isNoShow ? (
                      isNoShowToday ? (
                        <TableHead>Time Past Start</TableHead>
                      ) : null
                    ) : (
                      <>
                        <TableHead>Clocked In</TableHead>
                        <TableHead>Late By</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activeData as any[]).map((r, idx) => (
                    <TableRow key={`${r.shiftId}-${idx}`}>
                      <TableCell>
                        {r.driverId ? (
                          <Link href={`/drivers/${r.driverId}`}>
                            <span
                              className="font-medium text-primary hover:underline cursor-pointer"
                              data-testid={`link-driver-${r.driverId}`}
                            >
                              {r.driverName}
                            </span>
                          </Link>
                        ) : (
                          <span className="font-medium">{r.driverName}</span>
                        )}
                      </TableCell>
                      {isMultiDay && (
                        <TableCell className="text-sm">
                          {formatShortDate(r.shiftDate)}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {r.accountId ? (
                          <Link href={`/accounts/${r.accountId}`}>
                            <span className="text-primary hover:underline cursor-pointer">
                              {r.accountName}
                            </span>
                          </Link>
                        ) : (
                          r.accountName || "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatTime(r.scheduledStart)}
                      </TableCell>
                      {isNoShow ? (
                        isNoShowToday ? (
                          <TableCell>
                            <Badge variant="destructive">
                              {fmtMinutes(r.minutesPastStart ?? 0)} overdue
                            </Badge>
                          </TableCell>
                        ) : null
                      ) : (
                        <>
                          <TableCell className="text-sm">
                            {formatTime((r as LateRecord).clockIn)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                (r as LateRecord).minutesLate > 30
                                  ? "bg-destructive/15 text-destructive border-destructive/20"
                                  : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
                              }
                            >
                              +{fmtMinutes((r as LateRecord).minutesLate)}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Attendance widget card ────────────────────────────────────────────────────

function AttendanceWidget({
  title,
  subtitle,
  icon: Icon,
  count,
  isLoading,
  reportKey,
  colorClass,
  iconBgClass,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  count: number;
  isLoading: boolean;
  reportKey: AttendanceReportKey;
  colorClass: string;
  iconBgClass: string;
  onClick: (key: AttendanceReportKey) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover-elevate"
      onClick={() => onClick(reportKey)}
      data-testid={`card-attendance-${reportKey}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBgClass}`}>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-12 bg-muted animate-pulse rounded" />
        ) : (
          <div className={`text-3xl font-bold ${colorClass}`}>{count}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DriversDashboard() {
  const [openReport, setOpenReport] = useState<AttendanceReportKey>(null);

  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const { data: allTrips = [] } = useQuery<Trip[]>({
    queryKey: ["/api/corporate/trips"],
    select: (data: any) => Array.isArray(data) ? data : (data?.trips ?? []),
  });

  const { data: allAccidents = [] } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  // Attendance counts (lightweight — just lengths)
  const { data: noShowToday = [], isLoading: loadingNST } = useQuery<NoShowRecord[]>({
    queryKey: ["/api/attendance/no-show-today"],
  });
  const { data: noShow7 = [], isLoading: loadingNS7 } = useQuery<NoShowRecord[]>({
    queryKey: ["/api/attendance/no-show-7days"],
  });
  const { data: lateToday = [], isLoading: loadingLT } = useQuery<LateRecord[]>({
    queryKey: ["/api/attendance/late-today"],
  });
  const { data: late7 = [], isLoading: loadingL7 } = useQuery<LateRecord[]>({
    queryKey: ["/api/attendance/late-7days"],
  });

  const activeDrivers = drivers.filter((d) => d.status === "active");
  const inactiveDrivers = drivers.filter((d) => d.status === "inactive");
  const suspendedDrivers = drivers.filter((d) => d.status === "suspended");

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const expiringLicenses = drivers.filter((d) => {
    if (!d.licenseExpiration) return false;
    const expDate = parseDateSafe(d.licenseExpiration);
    return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
  });

  const driverTripCounts = drivers
    .map((driver) => ({
      driver,
      tripCount: allTrips.filter((t) => t.driverId === driver.id).length,
    }))
    .sort((a, b) => b.tripCount - a.tripCount)
    .slice(0, 5);

  const driverAccidentCounts = drivers
    .map((driver) => ({
      driver,
      accidentCount: allAccidents.filter((a) => a.driverId === driver.id).length,
    }))
    .sort((a, b) => b.accidentCount - a.accidentCount)
    .slice(0, 5);

  const summaryContent = `
DRIVERS SUMMARY
Total Drivers: ${drivers.length}
Active: ${activeDrivers.length}
Inactive: ${inactiveDrivers.length}
Suspended: ${suspendedDrivers.length}
Licenses Expiring This Month: ${expiringLicenses.length}

ATTENDANCE (TODAY):
No Shows Today: ${noShowToday.length}
Late Today: ${lateToday.length}

TOP PERFORMERS (by trips):
${driverTripCounts
  .map(
    (d, i) =>
      `${i + 1}. ${d.driver.user?.firstName} ${d.driver.user?.lastName} - ${d.tripCount} trips`
  )
  .join("\n")}
  `.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Drivers Dashboard</h1>
          <EmailSummaryDialog title="Drivers" summaryContent={summaryContent} />
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of all driver metrics and statistics
        </p>
      </div>

      <ModuleDashboard moduleKey="drivers" />

      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/drivers">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-drivers">
                {drivers.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/drivers?status=active">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeDrivers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently active</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/drivers?status=inactive">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                <UserX className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inactiveDrivers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Not currently driving</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/drivers?status=suspended">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspended</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {suspendedDrivers.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Suspended drivers</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Attendance section ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Attendance</h2>
          <p className="text-sm text-muted-foreground">
            Click any card to view the full infraction report
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AttendanceWidget
            title="No Show Today"
            subtitle="Not clocked in 30+ min past start"
            icon={CalendarOff}
            count={noShowToday.length}
            isLoading={loadingNST}
            reportKey="no-show-today"
            colorClass="text-destructive"
            iconBgClass="bg-destructive/10"
            onClick={setOpenReport}
          />
          <AttendanceWidget
            title="No Show — Last 7 Days"
            subtitle="Missed full shift, prior 7 days"
            icon={CalendarOff}
            count={noShow7.length}
            isLoading={loadingNS7}
            reportKey="no-show-7days"
            colorClass="text-destructive"
            iconBgClass="bg-destructive/10"
            onClick={setOpenReport}
          />
          <AttendanceWidget
            title="Late Today"
            subtitle="Clocked in past scheduled start"
            icon={Timer}
            count={lateToday.length}
            isLoading={loadingLT}
            reportKey="late-today"
            colorClass="text-yellow-600 dark:text-yellow-400"
            iconBgClass="bg-yellow-500/10"
            onClick={setOpenReport}
          />
          <AttendanceWidget
            title="Late — Last 7 Days"
            subtitle="Late arrivals, prior 7 days"
            icon={Timer}
            count={late7.length}
            isLoading={loadingL7}
            reportKey="late-7days"
            colorClass="text-yellow-600 dark:text-yellow-400"
            iconBgClass="bg-yellow-500/10"
            onClick={setOpenReport}
          />
        </div>
      </div>

      {/* ── Existing cards ─────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              Expiring Licenses
            </CardTitle>
            <CardDescription>Licenses expiring this month</CardDescription>
          </CardHeader>
          <CardContent>
            {expiringLicenses.length > 0 ? (
              <div className="space-y-3">
                {expiringLicenses.map((driver) => (
                  <Link key={driver.id} href={`/drivers/${driver.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium">
                          {driver.user?.firstName} {driver.user?.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expires: {formatDate(driver.licenseExpiration)}
                        </p>
                      </div>
                      <Badge variant="destructive">Expiring</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No licenses expiring this month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Performers
            </CardTitle>
            <CardDescription>Most moves completed</CardDescription>
          </CardHeader>
          <CardContent>
            {driverTripCounts.length > 0 ? (
              <div className="space-y-3">
                {driverTripCounts.map(({ driver, tripCount }, index) => (
                  <Link key={driver.id} href={`/drivers/${driver.id}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">
                          #{index + 1}
                        </span>
                        <div>
                          <p className="font-medium">
                            {driver.user?.firstName} {driver.user?.lastName}
                          </p>
                        </div>
                      </div>
                      <Badge>{tripCount} moves</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No trip data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Claims by Driver
            </CardTitle>
            <CardDescription>Drivers with most claims</CardDescription>
          </CardHeader>
          <CardContent>
            {driverAccidentCounts.filter((d) => d.accidentCount > 0).length > 0 ? (
              <div className="space-y-3">
                {driverAccidentCounts
                  .filter((d) => d.accidentCount > 0)
                  .map(({ driver, accidentCount }) => (
                    <Link
                      key={driver.id}
                      href={`/drivers/${driver.id}?tab=accidents`}
                    >
                      <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                        <div>
                          <p className="font-medium">
                            {driver.user?.firstName} {driver.user?.lastName}
                          </p>
                        </div>
                        <Badge variant="destructive">{accidentCount} claims</Badge>
                      </div>
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No claims on record</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Drivers with Most Time Off ──────────────────────────────────── */}
      <WiwTimeOffWidget />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Driver Activity
          </CardTitle>
          <CardDescription>Latest driver updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {drivers.slice(0, 5).map((driver) => (
              <Link key={driver.id} href={`/drivers/${driver.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">
                        {driver.user?.firstName} {driver.user?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {driver.driverClassification || "Driver"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={driver.status} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Attendance drill-down sheet */}
      <AttendanceSheet
        open={openReport !== null}
        onClose={() => setOpenReport(null)}
        reportKey={openReport}
      />
    </div>
  );
}
