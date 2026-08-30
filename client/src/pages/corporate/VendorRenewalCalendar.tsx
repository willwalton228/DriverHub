import { useState } from "react";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CalendarDays, AlertTriangle, RefreshCw, RotateCcw,
  ShieldAlert, CheckCircle2, XCircle, Clock, ChevronRight, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

type RenewalCalendarEntry = {
  contractId: string;
  vendorId: string;
  vendorName: string;
  contractName: string;
  contractType: string;
  contractStatus: string;
  endDate: string;
  noticeDeadlineDate: string | null;
  autoRenewalDate: string | null;
  autoRenew: boolean;
  renewalDecisionStatus: string;
  renewalOwnerId: string | null;
  noticePeriodDays: number | null;
  renewalTermDays: number | null;
  daysUntilEnd: number;
  daysUntilNotice: number | null;
  isAutoRenewalRisk: boolean;
  isImmediateAction: boolean;
  openAlerts: number;
};

type RenewalDashboard = {
  upcomingRenewals: RenewalCalendarEntry[];
  immediateAction: RenewalCalendarEntry[];
  autoRenewalRisk: RenewalCalendarEntry[];
  totalUpcoming: number;
  totalImmediate: number;
  totalRisk: number;
};

const decisionLabels: Record<string, string> = {
  undecided: "Undecided",
  renew: "Renew",
  renegotiate: "Renegotiate",
  terminate: "Terminate",
};

const decisionColors: Record<string, string> = {
  undecided: "secondary",
  renew: "default",
  renegotiate: "outline",
  terminate: "destructive",
};

function daysLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

function daysColor(days: number, urgent: boolean) {
  if (urgent || days <= 14) return "text-red-600 dark:text-red-400 font-semibold";
  if (days <= 30) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-muted-foreground";
}

function RenewalRow({
  entry,
  onDecisionChange,
  saving,
}: {
  entry: RenewalCalendarEntry;
  onDecisionChange: (contractId: string, decision: string) => void;
  saving: boolean;
}) {
  return (
    <TableRow data-testid={`row-renewal-${entry.contractId}`} className={entry.isImmediateAction ? "bg-red-50/40 dark:bg-red-950/20" : entry.isAutoRenewalRisk ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}>
      <TableCell>
        <div>
          <p className="text-sm font-medium" data-testid={`text-vendor-name-${entry.contractId}`}>{entry.vendorName}</p>
          <p className="text-xs text-muted-foreground">{entry.contractName}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          {entry.isImmediateAction && (
            <Badge className="text-[10px] bg-red-500 text-white w-fit">Immediate</Badge>
          )}
          {entry.isAutoRenewalRisk && !entry.isImmediateAction && (
            <Badge className="text-[10px] bg-amber-500 text-white w-fit">Auto-Renewal Risk</Badge>
          )}
          {entry.openAlerts > 0 && (
            <Badge variant="outline" className="text-[10px] w-fit">{entry.openAlerts} alert{entry.openAlerts !== 1 ? "s" : ""}</Badge>
          )}
          {!entry.isImmediateAction && !entry.isAutoRenewalRisk && entry.openAlerts === 0 && (
            <span className="text-xs text-muted-foreground">Normal</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs">{formatDate(entry.endDate)}</span>
            <span className={`text-xs ${daysColor(entry.daysUntilEnd, entry.isImmediateAction)}`}>({daysLabel(entry.daysUntilEnd)})</span>
          </div>
          {entry.noticeDeadlineDate && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Notice: {formatDate(entry.noticeDeadlineDate)}</span>
              {entry.daysUntilNotice != null && (
                <span className={`text-xs ${daysColor(entry.daysUntilNotice, entry.isImmediateAction)}`}>({daysLabel(entry.daysUntilNotice)})</span>
              )}
            </div>
          )}
          {entry.autoRenewalDate && (
            <div className="flex items-center gap-1.5">
              <RotateCcw className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Auto-renews: {formatDate(entry.autoRenewalDate)}</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {entry.autoRenew ? (
          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400">Auto-Renew On</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Manual</Badge>
        )}
      </TableCell>
      <TableCell>
        <Select
          value={entry.renewalDecisionStatus}
          onValueChange={(val) => onDecisionChange(entry.contractId, val)}
          disabled={saving}
        >
          <SelectTrigger className="h-8 text-xs w-36" data-testid={`select-decision-${entry.contractId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="undecided">Undecided</SelectItem>
            <SelectItem value="renew">Renew</SelectItem>
            <SelectItem value="renegotiate">Renegotiate</SelectItem>
            <SelectItem value="terminate">Terminate</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Link href="/vendors" data-testid={`link-view-vendor-${entry.contractId}`}>
          <Button size="icon" variant="ghost">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}

export default function VendorRenewalCalendar() {
  const { toast } = useToast();
  const [horizon, setHorizon] = useState("180");
  const [filterDecision, setFilterDecision] = useState("all");
  const [savingContractId, setSavingContractId] = useState<string | null>(null);

  const { data: calendar = [], isLoading: calendarLoading, refetch } = useQuery<RenewalCalendarEntry[]>({
    queryKey: ["/api/vendors/renewal-calendar", horizon],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/renewal-calendar?horizon=${horizon}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<RenewalDashboard>({
    queryKey: ["/api/vendors/renewal-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/vendors/renewal-dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ contractId, decision }: { contractId: string; decision: string }) => {
      setSavingContractId(contractId);
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/renewal-decision`, { renewalDecisionStatus: decision });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/renewal-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/renewal-dashboard"] });
      setSavingContractId(null);
    },
    onError: (err: any) => {
      setSavingContractId(null);
      toast({ title: "Failed to update decision", description: err.message, variant: "destructive" });
    },
  });

  const filtered = calendar.filter(e => {
    if (filterDecision !== "all" && e.renewalDecisionStatus !== filterDecision) return false;
    return true;
  });

  const immediateCount = dashboard?.totalImmediate ?? 0;
  const riskCount = dashboard?.totalRisk ?? 0;
  const totalCount = dashboard?.totalUpcoming ?? calendar.length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/vendors">
            <Button variant="ghost" size="sm" className="mt-0.5" data-testid="button-back-to-vendors">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Vendors
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="heading-renewal-calendar">Vendor Renewal Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">Track upcoming contract renewals, notice deadlines, and auto-renewal risks.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-calendar">
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {dashboardLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i}><CardContent className="pt-6 pb-4"><div className="h-12 bg-muted rounded animate-pulse" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Upcoming (180d)</p>
                  <p className="text-2xl font-bold" data-testid="text-stat-total">{totalCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={immediateCount > 0 ? "border-red-300 dark:border-red-700" : ""}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${immediateCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">Immediate Action (≤14d)</p>
                  <p className={`text-2xl font-bold ${immediateCount > 0 ? "text-red-600 dark:text-red-400" : ""}`} data-testid="text-stat-immediate">{immediateCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={riskCount > 0 ? "border-amber-300 dark:border-amber-700" : ""}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className={`h-5 w-5 shrink-0 ${riskCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">Auto-Renewal Risk</p>
                  <p className={`text-2xl font-bold ${riskCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`} data-testid="text-stat-risk">{riskCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-44" data-testid="select-horizon">
            <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Horizon" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 180 days</SelectItem>
            <SelectItem value="365">Next 365 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDecision} onValueChange={setFilterDecision}>
          <SelectTrigger className="w-44" data-testid="select-filter-decision">
            <SelectValue placeholder="Decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Decisions</SelectItem>
            <SelectItem value="undecided">Undecided</SelectItem>
            <SelectItem value="renew">Renew</SelectItem>
            <SelectItem value="renegotiate">Renegotiate</SelectItem>
            <SelectItem value="terminate">Terminate</SelectItem>
          </SelectContent>
        </Select>
        {filtered.length !== calendar.length && (
          <span className="text-xs text-muted-foreground">Showing {filtered.length} of {calendar.length}</span>
        )}
      </div>

      {/* Calendar table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Contract Renewal Schedule
            {calendar.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{filtered.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {calendarLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No contracts match the selected filters for this horizon.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor / Contract</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Key Dates</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(entry => (
                  <RenewalRow
                    key={entry.contractId}
                    entry={entry}
                    onDecisionChange={(contractId, decision) => decisionMutation.mutate({ contractId, decision })}
                    saving={savingContractId === entry.contractId && decisionMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
