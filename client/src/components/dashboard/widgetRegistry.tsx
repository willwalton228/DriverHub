import { useQuery } from "@tanstack/react-query";
import { parseDateSafe } from "@/lib/dateFormat";
import { useState } from "react";
import { ChaseDriverOpportunity } from "./widgets/ChaseDriverOpportunity";
import { DriverUtilizationWidget } from "./widgets/DriverUtilizationWidget";
import { ExpiredMVRWidget } from "./widgets/ExpiredMVRWidget";
import { MVRExpiringSoonWidget } from "./widgets/MVRExpiringSoonWidget";
import { ExpiredLicenseWidget } from "./widgets/ExpiredLicenseWidget";
import { LicenseExpiringSoonWidget } from "./widgets/LicenseExpiringSoonWidget";
import { AttendanceExceptionsWidget } from "./widgets/AttendanceExceptionsWidget";
import { LateDriversWidget } from "./widgets/LateDriversWidget";
import { AtRiskDriversWidget } from "./widgets/AtRiskDriversWidget";
import { ComplianceCommandWidget } from "./widgets/ComplianceCommandWidget";
import { OpsMovesSummaryWidget } from "./widgets/OpsMovesSummaryWidget";
import { OpsTopAccountsWidget } from "./widgets/OpsTopAccountsWidget";
import { OpsDriverProductivityWidget } from "./widgets/OpsDriverProductivityWidget";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DriverWithUser, Accident } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "wouter";
import {
  Users, UserCheck, UserX, AlertTriangle, TrendingUp, IdCard, Clock,
  FileText, Building2, Shield, Loader2, CalendarOff, ShieldAlert,
  Activity, CalendarClock, ClipboardList, Heart, Receipt, Timer,
  Layers, Hourglass, BarChart3, Unplug, Route, Car, Truck,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

function WidgetShell({ children, isLoading }: { children: React.ReactNode; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}

function NotConnected({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="widget-not-connected">
      <Unplug className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/70">Data source not connected</p>
    </div>
  );
}

function DriversStatusSummary() {
  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const active = drivers.filter(d => d.status === "active").length;
  const inactive = drivers.filter(d => d.status === "inactive").length;
  const suspended = drivers.filter(d => d.status === "suspended").length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/drivers">
          <div className="p-3 rounded-md hover-elevate cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold" data-testid="widget-drivers-total">{drivers.length}</p>
          </div>
        </Link>
        <Link href="/drivers?status=active">
          <div className="p-3 rounded-md hover-elevate cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold text-green-600" data-testid="widget-drivers-active">{active}</p>
          </div>
        </Link>
        <Link href="/drivers?status=inactive">
          <div className="p-3 rounded-md hover-elevate cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Inactive</span>
            </div>
            <p className="text-2xl font-bold" data-testid="widget-drivers-inactive">{inactive}</p>
          </div>
        </Link>
        <Link href="/drivers?status=suspended">
          <div className="p-3 rounded-md hover-elevate cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Suspended</span>
            </div>
            <p className="text-2xl font-bold text-destructive" data-testid="widget-drivers-suspended">{suspended}</p>
          </div>
        </Link>
      </div>
    </WidgetShell>
  );
}

function ExpiringDocsCompliance() {
  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expiringLicense = drivers.filter(d => {
    if (!d.licenseExpiration) return false;
    const exp = parseDateSafe(d.licenseExpiration);
    return exp >= now && exp <= thirtyDaysOut;
  });

  const expiredLicense = drivers.filter(d => {
    if (!d.licenseExpiration) return false;
    return parseDateSafe(d.licenseExpiration) < now;
  });

  const missingLicense = drivers.filter(d => !d.licenseNumber && d.status === "active");

  const totalAlerts = expiredLicense.length + expiringLicense.length + missingLicense.length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-expiring-docs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-2xl font-bold" data-testid="widget-compliance-alert-count">{totalAlerts}</span>
          <Badge variant={totalAlerts > 0 ? "destructive" : "secondary"}>
            {totalAlerts > 0 ? "Action Needed" : "All Clear"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-expired-licenses">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="text-sm">Expired Licenses</span>
            </div>
            <span className="text-sm font-bold text-destructive">{expiredLicense.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-expiring-soon">
            <div className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-amber-600" />
              <span className="text-sm">Expiring in 30 days</span>
            </div>
            <span className="text-sm font-bold text-amber-600">{expiringLicense.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-missing-license">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Missing License #</span>
            </div>
            <span className="text-sm font-bold">{missingLicense.length}</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function DriverActivity7d() {
  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const { data: accidents = [], isLoading: accidentsLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentClaims = accidents.filter(a => {
    const d = a.incidentDate ? parseDateSafe(a.incidentDate) : a.createdAt ? new Date(a.createdAt) : null;
    return d && d >= sevenDaysAgo;
  });

  const newDrivers = drivers.filter(d => {
    const created = d.createdAt ? new Date(d.createdAt) : null;
    return created && created >= sevenDaysAgo;
  });

  const statusChanges = drivers.filter(d => {
    const updated = d.updatedAt ? new Date(d.updatedAt) : null;
    return updated && updated >= sevenDaysAgo && d.status !== "active";
  });

  return (
    <WidgetShell isLoading={driversLoading || accidentsLoading}>
      <div className="space-y-3" data-testid="widget-driver-activity-7d">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-new-claims-7d">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-600" />
              <span className="text-sm">New Claims</span>
            </div>
            <span className="text-sm font-bold">{recentClaims.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-new-drivers-7d">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm">New Drivers Added</span>
            </div>
            <span className="text-sm font-bold">{newDrivers.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-status-changes-7d">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm">Status Changes</span>
            </div>
            <span className="text-sm font-bold">{statusChanges.length}</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function DriversExpiringLicenses() {
  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const now = new Date();
  const expiring = drivers.filter(d => {
    if (!d.licenseExpiration) return false;
    const exp = parseDateSafe(d.licenseExpiration);
    return exp.getMonth() === now.getMonth() && exp.getFullYear() === now.getFullYear();
  });

  return (
    <WidgetShell isLoading={isLoading}>
      {expiring.length > 0 ? (
        <div className="space-y-2">
          {expiring.slice(0, 5).map(driver => (
            <Link key={driver.id} href={`/drivers/${driver.id}`}>
              <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`widget-expiring-${driver.id}`}>
                <div>
                  <p className="text-sm font-medium">{driver.user?.firstName} {driver.user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">Expires: {formatDate(driver.licenseExpiration)}</p>
                </div>
                <Badge variant="destructive">Expiring</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">No licenses expiring this month</p>
      )}
    </WidgetShell>
  );
}

function DriversTopPerformers() {
  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const { data: trips = [], isLoading: tripsLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/trips"],
    select: (data: any) => Array.isArray(data) ? data : (data?.trips ?? []),
  });

  const topDrivers = drivers.map(driver => ({
    driver,
    tripCount: trips.filter(t => t.driverId === driver.id).length,
  })).sort((a, b) => b.tripCount - a.tripCount).slice(0, 5);

  return (
    <WidgetShell isLoading={driversLoading || tripsLoading}>
      {topDrivers.length > 0 ? (
        <div className="space-y-2">
          {topDrivers.map(({ driver, tripCount }, i) => (
            <Link key={driver.id} href={`/drivers/${driver.id}`}>
              <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`widget-top-driver-${driver.id}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                  <p className="text-sm font-medium">{driver.user?.firstName} {driver.user?.lastName}</p>
                </div>
                <Badge>{tripCount} moves</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">No trip data available</p>
      )}
    </WidgetShell>
  );
}

function DriversClaims() {
  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });
  const { data: accidents = [], isLoading: accidentsLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const driverClaims = drivers.map(driver => ({
    driver,
    count: accidents.filter(a => a.driverId === driver.id).length,
  })).filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <WidgetShell isLoading={driversLoading || accidentsLoading}>
      {driverClaims.length > 0 ? (
        <div className="space-y-2">
          {driverClaims.map(({ driver, count }) => (
            <Link key={driver.id} href={`/drivers/${driver.id}?tab=claims`}>
              <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`widget-claims-driver-${driver.id}`}>
                <p className="text-sm font-medium">{driver.user?.firstName} {driver.user?.lastName}</p>
                <Badge variant="destructive">{count} claims</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">No claims on record</p>
      )}
    </WidgetShell>
  );
}

function EmployeesStatusSummary() {
  const { data: employees = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/employees"],
  });
  const active = employees.filter(e => e.status === "active").length;
  const inactive = employees.filter(e => e.status !== "active").length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Total</span>
          </div>
          <p className="text-2xl font-bold" data-testid="widget-employees-total">{employees.length}</p>
        </div>
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-muted-foreground">Active</span>
          </div>
          <p className="text-2xl font-bold text-green-600" data-testid="widget-employees-active">{active}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function PendingTimeOffRequests() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/time-off"],
  });

  const requests = data || [];
  const pending = requests.filter((r: any) => r.status === "pending");
  const approved = requests.filter((r: any) => r.status === "approved");

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-pending-time-off">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold text-amber-600" data-testid="widget-timeoff-pending-count">{pending.length}</p>
          </div>
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-muted-foreground">Approved</span>
            </div>
            <p className="text-2xl font-bold text-green-600" data-testid="widget-timeoff-approved-count">{approved.length}</p>
          </div>
        </div>
        {pending.length > 0 && (
          <div className="space-y-1.5">
            {pending.slice(0, 4).map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-2 rounded-md text-sm" data-testid={`widget-timeoff-pending-${req.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{req.employeeName || "Employee"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(req.startDate)} - {formatDate(req.endDate)}
                  </p>
                </div>
                <Badge variant="secondary">{req.leaveType || "Time Off"}</Badge>
              </div>
            ))}
          </div>
        )}
        {pending.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">No pending requests</p>
        )}
      </div>
    </WidgetShell>
  );
}


function ClaimsOverview() {
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });
  const open = accidents.filter(a => a.status === "open" || a.status === "under_investigation").length;
  const resolved = accidents.filter(a => a.status === "resolved" || a.status === "closed").length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Total</span>
          </div>
          <p className="text-2xl font-bold" data-testid="widget-claims-total">{accidents.length}</p>
        </div>
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-muted-foreground">Open</span>
          </div>
          <p className="text-2xl font-bold text-amber-600" data-testid="widget-claims-open">{open}</p>
        </div>
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-muted-foreground">Resolved</span>
          </div>
          <p className="text-2xl font-bold text-green-600" data-testid="widget-claims-resolved">{resolved}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function AccountsSummary() {
  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
  });
  const active = customers.filter(c => c.status === "active").length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/customers">
          <div className="p-3 rounded-md hover-elevate cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total Accounts</span>
            </div>
            <p className="text-2xl font-bold" data-testid="widget-accounts-total">{customers.length}</p>
          </div>
        </Link>
        <div className="p-3 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-muted-foreground">Active</span>
          </div>
          <p className="text-2xl font-bold text-green-600" data-testid="widget-accounts-active">{active}</p>
        </div>
      </div>
    </WidgetShell>
  );
}

function AccountHealthSummary() {
  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const green = customers.filter(c => c.health === "green").length;
  const yellow = customers.filter(c => c.health === "yellow").length;
  const red = customers.filter(c => c.health === "red").length;
  const unscored = customers.filter(c => !c.health).length;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-account-health">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-muted-foreground">Healthy</span>
            </div>
            <p className="text-2xl font-bold text-green-600" data-testid="widget-health-green">{green}</p>
          </div>
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-muted-foreground">At Risk</span>
            </div>
            <p className="text-2xl font-bold text-amber-600" data-testid="widget-health-yellow">{yellow}</p>
          </div>
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Critical</span>
            </div>
            <p className="text-2xl font-bold text-destructive" data-testid="widget-health-red">{red}</p>
          </div>
          <div className="p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Unscored</span>
            </div>
            <p className="text-2xl font-bold" data-testid="widget-health-unscored">{unscored}</p>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function OpenInvoicesAging() {
  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
  });

  const now = new Date();
  const openInvoices = invoices.filter((inv: any) => inv.status === "sent" || inv.status === "viewed" || inv.status === "overdue");

  const current: any[] = [];
  const days1to30: any[] = [];
  const days31to60: any[] = [];
  const days61plus: any[] = [];

  openInvoices.forEach((inv: any) => {
    if (!inv.dueDate) { current.push(inv); return; }
    const due = parseDateSafe(inv.dueDate);
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 0) current.push(inv);
    else if (daysOverdue <= 30) days1to30.push(inv);
    else if (daysOverdue <= 60) days31to60.push(inv);
    else days61plus.push(inv);
  });

  const sumAmount = (arr: any[]) => arr.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-invoices-aging">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">{openInvoices.length} open invoices</span>
          <span className="text-sm font-bold" data-testid="widget-invoices-total-amount">
            ${sumAmount(openInvoices).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-aging-current">
            <span className="text-sm">Current</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{current.length} inv</span>
              <span className="text-sm font-medium">${sumAmount(current).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-aging-1-30">
            <span className="text-sm text-amber-600">1-30 days</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{days1to30.length} inv</span>
              <span className="text-sm font-medium text-amber-600">${sumAmount(days1to30).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-aging-31-60">
            <span className="text-sm text-orange-600">31-60 days</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{days31to60.length} inv</span>
              <span className="text-sm font-medium text-orange-600">${sumAmount(days31to60).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-aging-61-plus">
            <span className="text-sm text-destructive">61+ days</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{days61plus.length} inv</span>
              <span className="text-sm font-medium text-destructive">${sumAmount(days61plus).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function SLAPerformance() {
  return (
    <NotConnected label="SLA Performance (7/30 day)" />
  );
}

function OpenClaimsByStage() {
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const stageCounts: Record<string, number> = {};
  accidents.forEach(a => {
    const status = a.claimStatus || a.status || "unknown";
    stageCounts[status] = (stageCounts[status] || 0) + 1;
  });

  const stageLabels: Record<string, string> = {
    DRAFT: "Draft",
    OPEN: "Open",
    UNDER_INVESTIGATION: "Under Investigation",
    PENDING_REVIEW: "Pending Review",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    open: "Open",
    under_investigation: "Under Investigation",
    resolved: "Resolved",
    closed: "Closed",
  };

  const stageColors: Record<string, string> = {
    DRAFT: "text-muted-foreground",
    OPEN: "text-amber-600",
    UNDER_INVESTIGATION: "text-primary",
    PENDING_REVIEW: "text-amber-600",
    RESOLVED: "text-green-600",
    CLOSED: "text-muted-foreground",
    open: "text-amber-600",
    under_investigation: "text-primary",
    resolved: "text-green-600",
    closed: "text-muted-foreground",
  };

  const sortedStages = Object.entries(stageCounts).sort((a, b) => b[1] - a[1]);

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-2" data-testid="widget-claims-by-stage">
        {sortedStages.length > 0 ? sortedStages.map(([stage, count]) => (
          <div key={stage} className="flex items-center justify-between p-2 rounded-md" data-testid={`widget-stage-${stage}`}>
            <span className={`text-sm ${stageColors[stage] || ""}`}>
              {stageLabels[stage] || stage}
            </span>
            <span className={`text-sm font-bold ${stageColors[stage] || ""}`}>{count}</span>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground py-2">No claims</p>
        )}
      </div>
    </WidgetShell>
  );
}

function ClaimsAging() {
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const now = new Date();
  const openClaims = accidents.filter(a => {
    const s = (a.claimStatus || a.status || "").toLowerCase();
    return s !== "closed" && s !== "resolved";
  });

  const under7: Accident[] = [];
  const days7to30: Accident[] = [];
  const days30to90: Accident[] = [];
  const over90: Accident[] = [];

  openClaims.forEach(claim => {
    const created = claim.incidentDate ? parseDateSafe(claim.incidentDate) : claim.createdAt ? new Date(claim.createdAt) : now;
    const age = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (age < 7) under7.push(claim);
    else if (age <= 30) days7to30.push(claim);
    else if (age <= 90) days30to90.push(claim);
    else over90.push(claim);
  });

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-claims-aging">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">{openClaims.length} open claims</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-age-under7">
            <span className="text-sm text-green-600">&lt; 7 days</span>
            <span className="text-sm font-bold text-green-600">{under7.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-age-7-30">
            <span className="text-sm">7-30 days</span>
            <span className="text-sm font-bold">{days7to30.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-age-30-90">
            <span className="text-sm text-amber-600">30-90 days</span>
            <span className="text-sm font-bold text-amber-600">{days30to90.length}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-age-over90">
            <span className="text-sm text-destructive">90+ days</span>
            <span className="text-sm font-bold text-destructive">{over90.length}</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function ClaimsTrend() {
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const getDate = (a: Accident) => a.incidentDate ? parseDateSafe(a.incidentDate) : a.createdAt ? new Date(a.createdAt) : null;

  const last30 = accidents.filter(a => { const d = getDate(a); return d && d >= d30; }).length;
  const last60 = accidents.filter(a => { const d = getDate(a); return d && d >= d60; }).length;
  const last90 = accidents.filter(a => { const d = getDate(a); return d && d >= d90; }).length;

  const prev30 = last60 - last30;
  const trendDirection = last30 > prev30 ? "up" : last30 < prev30 ? "down" : "flat";

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-claims-trend">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-2xl font-bold" data-testid="widget-claims-last30">{last30}</span>
            <span className="text-xs text-muted-foreground ml-2">last 30 days</span>
          </div>
          <Badge variant={trendDirection === "up" ? "destructive" : trendDirection === "down" ? "default" : "secondary"} data-testid="widget-claims-trend-badge">
            {trendDirection === "up" ? "Trending Up" : trendDirection === "down" ? "Trending Down" : "Flat"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-30d">
            <span className="text-sm">30 days</span>
            <span className="text-sm font-bold">{last30}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-60d">
            <span className="text-sm">60 days</span>
            <span className="text-sm font-bold">{last60}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-md" data-testid="widget-claims-90d">
            <span className="text-sm">90 days</span>
            <span className="text-sm font-bold">{last90}</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

function RecentDriverActivity() {
  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-2">
        {drivers.slice(0, 5).map(driver => (
          <Link key={driver.id} href={`/drivers/${driver.id}`}>
            <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`widget-recent-driver-${driver.id}`}>
              <div>
                <p className="text-sm font-medium">{driver.user?.firstName} {driver.user?.lastName}</p>
                <p className="text-xs text-muted-foreground">{driver.driverClassification || "Driver"}</p>
              </div>
              <StatusBadge status={driver.status} />
            </div>
          </Link>
        ))}
        {drivers.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No driver activity</p>
        )}
      </div>
    </WidgetShell>
  );
}

function RecentClaims() {
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
  });
  const recent = [...accidents].sort((a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  ).slice(0, 5);

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-2">
        {recent.map(claim => (
          <Link key={claim.id} href={`/accidents/${claim.id}`}>
            <div className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer" data-testid={`widget-recent-claim-${claim.id}`}>
              <div>
                <p className="text-sm font-medium">Claim #{claim.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{claim.description?.slice(0, 40)}...</p>
              </div>
              <StatusBadge status={claim.status} />
            </div>
          </Link>
        ))}
        {recent.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No recent claims</p>
        )}
      </div>
    </WidgetShell>
  );
}

interface TimeOffEntry {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  isFullDay: boolean | null;
  market: string;
  manager: string;
  coverageStatus: string;
}

interface UpcomingTimeOffData {
  timeOffEntries: TimeOffEntry[];
  marketImpact: Record<string, { unavailableHours: number; employeeCount: number }>;
  totalActive: number;
  totalUnavailable: number;
  workforceImpactPct: number;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  bereavement: "Bereavement",
  other: "Other",
};

function UpcomingTimeOff() {
  const { data, isLoading } = useQuery<UpcomingTimeOffData>({
    queryKey: ["/api/corporate/upcoming-time-off"],
  });

  const entries = data?.timeOffEntries || [];
  const markets = data?.marketImpact || {};
  const impactPct = data?.workforceImpactPct || 0;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-upcoming-time-off">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" data-testid="text-time-off-count">{entries.length}</span>
            <span className="text-xs text-muted-foreground">upcoming in 10 days</span>
          </div>
          <Badge variant={impactPct > 10 ? "destructive" : impactPct > 5 ? "default" : "secondary"} data-testid="badge-workforce-impact">
            {impactPct}% impact
          </Badge>
        </div>

        {Object.keys(markets).length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="market-impact-summary">
            {Object.entries(markets).map(([market, stats]) => (
              <div key={market} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-muted">
                <span className="font-medium">{market}</span>
                <span className="text-muted-foreground">{stats.unavailableHours}h / {stats.employeeCount} emp</span>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 ? (
          <div className="space-y-1.5">
            {entries.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md text-sm"
                data-testid={`time-off-entry-${entry.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" data-testid={`text-employee-name-${entry.id}`}>{entry.employeeName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{formatDate(entry.startDate)} - {formatDate(entry.endDate)}</span>
                    <span>{entry.market}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant="secondary" data-testid={`badge-leave-type-${entry.id}`}>
                    {LEAVE_TYPE_LABELS[entry.leaveType] || entry.leaveType}
                  </Badge>
                </div>
              </div>
            ))}
            {entries.length > 8 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{entries.length - 8} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2" data-testid="text-no-time-off">No upcoming time off in the next 10 days</p>
        )}
      </div>
    </WidgetShell>
  );
}

function ClaimsCostVsMilesYearly() {
  const [range, setRange] = useState<"5" | "all">("5");

  const { data = [], isLoading } = useQuery<Array<{
    year: number;
    totalClaimAmount: number;
    totalMiles: number;
    amountPerMile: number;
    claimCount: number;
  }>>({
    queryKey: ["/api/claims/cost-vs-miles-yearly", range],
    queryFn: async () => {
      const res = await fetch(`/api/claims/cost-vs-miles-yearly?range=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const fmtMiles = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  interface TooltipPayloadItem {
    name: string;
    value: number;
    color: string;
    payload: { amountPerMile: number; claimCount: number };
  }

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
    if (!active || !payload?.length) return null;
    const claimAmount = payload.find(p => p.name === "Claims Paid")?.value ?? 0;
    const miles = payload.find(p => p.name === "Miles Driven")?.value ?? 0;
    const perMile = payload[0]?.payload?.amountPerMile ?? 0;
    const claimCount = payload[0]?.payload?.claimCount ?? 0;
    return (
      <div className="bg-popover text-popover-foreground border rounded-md shadow-md p-3 text-xs space-y-1.5 min-w-40">
        <p className="font-semibold text-sm">{label}</p>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Claims Paid</span>
          <span className="font-medium">{fmtCurrency(claimAmount)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Miles Driven</span>
          <span className="font-medium">{fmtMiles(miles)}</span>
        </div>
        {perMile > 0 && (
          <div className="flex justify-between gap-4 border-t pt-1.5 mt-1">
            <span className="text-muted-foreground">$ / Mile</span>
            <span className="font-medium">{fmtCurrency(perMile)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Claims</span>
          <span className="font-medium">{claimCount}</span>
        </div>
      </div>
    );
  }

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-claims-cost-vs-miles">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">Finalized claims cost vs operational miles</p>
          <div className="flex items-center gap-1 rounded-md border p-0.5" data-testid="toggle-claims-range">
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${range === "5" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange("5")}
              data-testid="button-range-5yr"
            >
              Last 5 Yrs
            </button>
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${range === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange("all")}
              data-testid="button-range-all"
            >
              All Time
            </button>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="widget-claims-cost-miles-empty">
            No finalized claims data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={fmtMiles}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Bar
                yAxisId="left"
                dataKey="totalClaimAmount"
                name="Claims Paid"
                fill="hsl(var(--destructive))"
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
                opacity={0.85}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalMiles"
                name="Miles Driven"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {data.length > 0 && (() => {
          const latest = data[data.length - 1];
          return (
            <div className="grid grid-cols-3 gap-2 pt-1 border-t" data-testid="widget-claims-summary-row">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Latest Year</p>
                <p className="font-semibold text-sm" data-testid="text-latest-year">{latest.year}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Claims Cost</p>
                <p className="font-semibold text-sm text-destructive" data-testid="text-latest-claim-amount">{fmtCurrency(latest.totalClaimAmount)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">$ / Mile</p>
                <p className="font-semibold text-sm" data-testid="text-latest-per-mile">{latest.amountPerMile > 0 ? fmtCurrency(latest.amountPerMile) : "—"}</p>
              </div>
            </div>
          );
        })()}
      </div>
    </WidgetShell>
  );
}

function ClaimsCountYearly() {
  const [range, setRange] = useState<"5" | "all">("5");

  const { data = [], isLoading } = useQuery<Array<{
    year: number;
    totalClaims: number;
    preventable: number;
    nonPreventable: number;
    yoyChange: number | null;
  }>>({
    queryKey: ["/api/claims/count-yearly", range],
    queryFn: async () => {
      const res = await fetch(`/api/claims/count-yearly?range=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  interface TooltipPayloadItem {
    value: number;
    payload: { totalClaims: number; yoyChange: number | null; preventable: number; nonPreventable: number };
  }

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    return (
      <div className="bg-popover text-popover-foreground border rounded-md shadow-md p-3 text-xs space-y-1.5 min-w-36">
        <p className="font-semibold text-sm">{label}</p>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Total Claims</span>
          <span className="font-medium">{p?.totalClaims ?? 0}</span>
        </div>
        {p?.yoyChange !== null && p?.yoyChange !== undefined && (
          <div className="flex justify-between gap-4 border-t pt-1.5">
            <span className="text-muted-foreground">YoY Change</span>
            <span className={`font-medium ${p.yoyChange > 0 ? "text-destructive" : p.yoyChange < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
              {p.yoyChange > 0 ? "+" : ""}{p.yoyChange}%
            </span>
          </div>
        )}
        {(p?.preventable ?? 0) + (p?.nonPreventable ?? 0) > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Preventable</span>
              <span className="font-medium">{p?.preventable ?? 0}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Non-Preventable</span>
              <span className="font-medium">{p?.nonPreventable ?? 0}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  const totalInPeriod = data.reduce((s, d) => s + d.totalClaims, 0);
  const latestYoY = data.length > 1 ? data[data.length - 1].yoyChange : null;

  return (
    <WidgetShell isLoading={isLoading}>
      <div className="space-y-3" data-testid="widget-claims-count-yearly">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-2xl font-bold" data-testid="text-claims-count-total">{totalInPeriod}</span>
              <span className="text-xs text-muted-foreground ml-1.5">claims in period</span>
            </div>
            {latestYoY !== null && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${latestYoY > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : latestYoY < 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                data-testid="text-claims-yoy"
              >
                {latestYoY > 0 ? "+" : ""}{latestYoY}% YoY
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5" data-testid="toggle-claims-count-range">
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${range === "5" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange("5")}
              data-testid="button-count-range-5yr"
            >
              Last 5 Yrs
            </button>
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${range === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange("all")}
              data-testid="button-count-range-all"
            >
              All Time
            </button>
          </div>
        </div>

        {data.length === 0 || totalInPeriod === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="widget-claims-count-empty">
            No claims data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar
                dataKey="totalClaims"
                name="Claims"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
                opacity={0.85}
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        {data.length > 0 && totalInPeriod > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1 border-t text-center" data-testid="widget-claims-count-footer">
            <div>
              <p className="text-xs text-muted-foreground">Peak Year</p>
              <p className="font-semibold text-sm" data-testid="text-claims-peak-year">
                {data.reduce((best, d) => d.totalClaims > best.totalClaims ? d : best, data[0]).year}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peak Count</p>
              <p className="font-semibold text-sm" data-testid="text-claims-peak-count">
                {Math.max(...data.map(d => d.totalClaims))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg / Year</p>
              <p className="font-semibold text-sm" data-testid="text-claims-avg-per-year">
                {data.length > 0 ? Math.round(totalInPeriod / data.filter(d => d.totalClaims > 0).length || 1) : 0}
              </p>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}

export type WidgetComponent = () => JSX.Element;

export const WIDGET_COMPONENT_MAP: Record<string, { component: WidgetComponent; icon: any; defaultTitle: string }> = {
  DriversStatusSummary: { component: DriversStatusSummary, icon: Users, defaultTitle: "Driver Status" },
  ExpiringDocsCompliance: { component: ExpiringDocsCompliance, icon: ShieldAlert, defaultTitle: "Expiring Docs / Compliance" },
  DriverActivity7d: { component: DriverActivity7d, icon: Activity, defaultTitle: "Driver Activity (7d)" },
  DriversExpiringLicenses: { component: DriversExpiringLicenses, icon: IdCard, defaultTitle: "Expiring Licenses" },
  DriversTopPerformers: { component: DriversTopPerformers, icon: TrendingUp, defaultTitle: "Top Performers" },
  DriversClaims: { component: DriversClaims, icon: AlertTriangle, defaultTitle: "Claims by Driver" },
  RecentDriverActivity: { component: RecentDriverActivity, icon: Clock, defaultTitle: "Recent Activity" },
  EmployeesStatusSummary: { component: EmployeesStatusSummary, icon: Users, defaultTitle: "Employee Status" },
  PendingTimeOffRequests: { component: PendingTimeOffRequests, icon: CalendarClock, defaultTitle: "Pending Time Off" },
  AttendanceExceptions: { component: AttendanceExceptionsWidget, icon: ClipboardList, defaultTitle: "Attendance Exceptions" },
  ClaimsOverview: { component: ClaimsOverview, icon: FileText, defaultTitle: "Claims Overview" },
  OpenClaimsByStage: { component: OpenClaimsByStage, icon: Layers, defaultTitle: "Claims by Stage" },
  ClaimsAging: { component: ClaimsAging, icon: Hourglass, defaultTitle: "Claims Aging" },
  ClaimsTrend: { component: ClaimsTrend, icon: BarChart3, defaultTitle: "Claims Trend (30/60/90)" },
  ClaimsCostVsMilesYearly: { component: ClaimsCostVsMilesYearly, icon: Route, defaultTitle: "Claims Cost vs Miles (Yearly)" },
  ClaimsCountYearly: { component: ClaimsCountYearly, icon: BarChart3, defaultTitle: "Claims Count by Year" },
  RecentClaims: { component: RecentClaims, icon: Clock, defaultTitle: "Recent Claims" },
  AccountsSummary: { component: AccountsSummary, icon: Building2, defaultTitle: "Accounts Summary" },
  AccountHealthSummary: { component: AccountHealthSummary, icon: Heart, defaultTitle: "Account Health" },
  OpenInvoicesAging: { component: OpenInvoicesAging, icon: Receipt, defaultTitle: "Open Invoices / Aging" },
  SLAPerformance: { component: SLAPerformance, icon: Timer, defaultTitle: "SLA Performance" },
  UpcomingTimeOff: { component: UpcomingTimeOff, icon: CalendarOff, defaultTitle: "Upcoming Time Off" },
  ChaseDriverOpportunity: { component: ChaseDriverOpportunity, icon: Car, defaultTitle: "Chase Driver Opportunity" },
  DriverUtilizationWidget: { component: DriverUtilizationWidget, icon: Activity, defaultTitle: "Driver Utilization & Recovery" },
  ComplianceCommandWidget: { component: ComplianceCommandWidget, icon: ShieldAlert, defaultTitle: "Compliance Command" },
  ExpiredMVRWidget: { component: ExpiredMVRWidget, icon: ClipboardList, defaultTitle: "Expired MVR" },
  MVRExpiringSoonWidget: { component: MVRExpiringSoonWidget, icon: CalendarClock, defaultTitle: "MVR Expiring (7 Days)" },
  ExpiredLicenseWidget: { component: ExpiredLicenseWidget, icon: IdCard, defaultTitle: "Expired Licenses" },
  LicenseExpiringSoonWidget: { component: LicenseExpiringSoonWidget, icon: CalendarClock, defaultTitle: "License Expiring (30 Days)" },
  LateDriversWidget: { component: LateDriversWidget, icon: Timer, defaultTitle: "Late Drivers" },
  AtRiskDriversWidget: { component: AtRiskDriversWidget, icon: ShieldAlert, defaultTitle: "At Risk Drivers" },
  // ── Operational Reporting widgets ──────────────────────────────────────────
  OpsMovesSummary:         { component: OpsMovesSummaryWidget,        icon: Truck,       defaultTitle: "Move Summary (30d)"         },
  OpsTopAccounts:          { component: OpsTopAccountsWidget,         icon: Building2,   defaultTitle: "Top Accounts (30d)"         },
  OpsDriverProductivity:   { component: OpsDriverProductivityWidget,  icon: Activity,    defaultTitle: "Driver Productivity (30d)"  },
};
