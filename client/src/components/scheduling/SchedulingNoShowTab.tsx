import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DriverEmailComposeDialog } from "@/components/drivers/DriverEmailComposeDialog";
import { cn } from "@/lib/utils";
import {
  readSchedulingReportSession,
  useSchedulingReportSessionId,
  writeSchedulingReportSession,
} from "@/components/scheduling/SchedulingReportSession";

type AttendanceStatus =
  | "Upcoming"
  | "Grace Period"
  | "Clocked In"
  | "Clocked In Late"
  | "Clock Data Delayed"
  | "Exception Resolved"
  | "Not Clocked In / Action Required";

type NoShowFinalDisposition =
  | "Clocked In"
  | "Late / Clocked In"
  | "Schedule Error"
  | "Clock-In Issue"
  | "Shift Cancelled"
  | "Other";

interface MonitorShift {
  shift_id: string;
  driver_id: string;
  driver_name: string;
  driver_email: string | null;
  worker_classification: string | null;
  account_id: string | null;
  account_name: string | null;
  network: string | null;
  wiw_location_id: string | null;
  wiw_location_name: string | null;
  wiw_timezone: string | null;
  shift_start_local: string | null;
  shift_start_utc: string;
  shift_start_et: string;
  grace_period_end_local: string | null;
  grace_period_end_et: string;
  clock_in_time_local: string | null;
  clock_in_time_et: string | null;
  attendance_status: AttendanceStatus;
  manual_no_show: {
    marked_at: string;
    marked_by: string;
    note: string | null;
  } | null;
  no_show_exception: {
    id: string;
    status: "OPEN" | "RESOLVED" | "CONFIRMED_NO_SHOW";
    first_detected_not_clocked_in: string | null;
    action: string | null;
    action_timestamp: string | null;
    final_disposition: string | null;
    marked_by: string | null;
    marked_at: string | null;
    note: string | null;
  } | null;
}

interface MonitorGroup {
  shift_start_utc: string;
  dispatch_start_time_et: string;
  distinct_local_start_times: string[];
  timezones_represented: string[];
  accounts_represented: Array<{ account_id: string | null; account_name: string | null }>;
  assigned_driver_count: number;
  clocked_in_count: number;
  grace_period_count: number;
  not_clocked_in_count: number;
  evaluated_at: string;
  shifts: MonitorShift[];
}

interface MonitorResponse {
  evaluated_at: string;
  data_freshness: {
    times_last_sync: string | null;
    shifts_last_sync: string | null;
    sync_interval_minutes: number;
    expected_max_latency_minutes: number;
    is_stale: boolean;
    freshness_warning: string;
  };
  groups: MonitorGroup[];
}

interface NoShowRefreshError extends Error {
  code?: string;
  lastSuccessfulSyncAt?: string | null;
}

type GroupStatus = "Upcoming" | "Grace Period" | "Clear" | "Action Required";
type FilterValue = "all" | string;
type SummaryView = "action-required" | "all-start-times";

interface NoShowReportState {
  selectedDate: string;
  accountFilter: FilterValue;
  networkFilter: FilterValue;
  timezoneFilter: FilterValue;
  summaryView: SummaryView;
  showLastSynchronizedData: boolean;
}

function datePartsInEastern(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function todayInEastern(): string {
  const parts = datePartsInEastern(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Convert an Eastern wall-clock date/time to UTC without assuming the
 * browser's timezone. Iteration accounts for DST transitions.
 */
function easternWallTimeToIso(date: string, time: string): string {
  const wallAsUtc = Date.parse(`${date}T${time}Z`);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const hour = values.hour === "24" ? "00" : values.hour;
    const renderedAsUtc = Date.parse(
      `${values.year}-${values.month}-${values.day}T${hour}:${values.minute}:00Z`,
    );
    guess += wallAsUtc - renderedAsUtc;
  }
  return new Date(guess).toISOString();
}

function formatSyncTimestamp(iso: string | null | undefined): string {
  if (!iso) return "an unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function latestSuccessfulSync(response: MonitorResponse | undefined): string | null {
  const timestamps = [
    response?.data_freshness.times_last_sync,
    response?.data_freshness.shifts_last_sync,
  ].filter((value): value is string => Boolean(value));
  return timestamps.sort().at(-1) ?? null;
}

async function fetchNoShowMonitor(url: string): Promise<MonitorResponse> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Cache-Control": "no-cache" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error || "Could not load the No Show Monitor",
    ) as NoShowRefreshError;
    error.code = payload?.code;
    error.lastSuccessfulSyncAt = payload?.last_successful_sync_at ?? null;
    throw error;
  }
  return payload as MonitorResponse;
}

function getGroupStatus(group: MonitorGroup): GroupStatus {
  if (group.not_clocked_in_count > 0) return "Action Required";
  if (group.grace_period_count > 0) return "Grace Period";
  if (group.assigned_driver_count > 0 && group.clocked_in_count === 0) return "Upcoming";
  return "Clear";
}

function statusBadge(status: GroupStatus) {
  if (status === "Action Required") {
    return <Badge variant="destructive">Action Required</Badge>;
  }
  if (status === "Grace Period") {
    return <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Grace Period</Badge>;
  }
  if (status === "Upcoming") {
    return <Badge variant="secondary">Upcoming</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">Clear</Badge>;
}

function attendanceBadge(shift: MonitorShift) {
  if (shift.manual_no_show) {
    return (
      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        Marked No Show
      </Badge>
    );
  }
  if (shift.attendance_status === "Clocked In Late") {
    return <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Clocked In Late</Badge>;
  }
  if (shift.attendance_status === "Clock Data Delayed") {
    return <Badge variant="outline" className="border-amber-400 text-amber-800 dark:border-amber-800 dark:text-amber-200">Clock Data Delayed</Badge>;
  }
  if (shift.attendance_status === "Exception Resolved") {
    return <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">{shift.no_show_exception?.final_disposition ?? "Resolved"}</Badge>;
  }
  return statusBadge(
    shift.attendance_status === "Not Clocked In / Action Required"
      ? "Action Required"
      : shift.attendance_status === "Clocked In"
        ? "Clear"
        : shift.attendance_status,
  );
}

function minutesPastDue(shift: MonitorShift): string {
  if (shift.attendance_status === "Clocked In" || shift.attendance_status === "Clocked In Late" || shift.attendance_status === "Exception Resolved") return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(shift.shift_start_utc).getTime()) / 60_000));
  return minutes > 0 ? `${minutes} min` : "—";
}

function clockInVariance(shift: MonitorShift): string {
  if (!shift.clock_in_time_et) return "—";
  const minutes = Math.round(
    (new Date(shift.clock_in_time_et).getTime() - new Date(shift.shift_start_utc).getTime()) / 60_000,
  );
  if (minutes === 0) return "On time";
  return `${minutes > 0 ? "+" : ""}${minutes} min`;
}

function accountNames(group: MonitorGroup): string {
  return group.accounts_represented
    .map((account) => account.account_name ?? "Account mapping pending")
    .join(", ");
}

function localStartNames(group: MonitorGroup): string {
  return group.distinct_local_start_times
    .map((value) => value.replace(/^\d{4}-\d{2}-\d{2}\s/, ""))
    .join(" · ");
}

function timezoneNames(group: MonitorGroup): string {
  return group.timezones_represented.length > 0
    ? group.timezones_represented.join(" · ")
    : "Timezone pending";
}

function formatDispatchStartEt(value: string): string {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})(?=\s)/, "$2/$3/$1");
}

function filteredGroup(group: MonitorGroup, shifts: MonitorShift[]): MonitorGroup {
  const clockedIn = shifts.filter((shift) => shift.attendance_status === "Clocked In" || shift.attendance_status === "Clocked In Late").length;
  const grace = shifts.filter((shift) => shift.attendance_status === "Grace Period").length;
  const actionRequired = shifts.filter((shift) => shift.attendance_status === "Not Clocked In / Action Required").length;
  const localTimes = [...new Set(shifts.map((shift) => shift.shift_start_local).filter(Boolean) as string[])].sort();
  const timezones = [...new Set(shifts.map((shift) => shift.wiw_timezone).filter(Boolean) as string[])].sort();
  const accounts = new Map<string, { account_id: string | null; account_name: string | null }>();
  for (const shift of shifts) {
    const key = shift.account_id ?? "__unassigned__";
    accounts.set(key, { account_id: shift.account_id, account_name: shift.account_name });
  }
  return {
    ...group,
    distinct_local_start_times: localTimes,
    timezones_represented: timezones,
    accounts_represented: [...accounts.values()].sort((left, right) => (left.account_name ?? "").localeCompare(right.account_name ?? "")),
    assigned_driver_count: shifts.length,
    clocked_in_count: clockedIn,
    grace_period_count: grace,
    not_clocked_in_count: actionRequired,
    shifts,
  };
}

export default function SchedulingNoShowTab() {
  const { toast } = useToast();
  const reportSessionId = useSchedulingReportSessionId();
  const restoredSession = useMemo(
    () => readSchedulingReportSession<NoShowReportState, MonitorResponse>("no-show", reportSessionId),
    [reportSessionId],
  );
  const restoredState = restoredSession?.state;
  const [selectedDate, setSelectedDate] = useState(() => restoredState?.selectedDate ?? todayInEastern());
  const [accountFilter, setAccountFilter] = useState<FilterValue>(() => restoredState?.accountFilter ?? "all");
  const [networkFilter, setNetworkFilter] = useState<FilterValue>(() => restoredState?.networkFilter ?? "all");
  const [timezoneFilter, setTimezoneFilter] = useState<FilterValue>(() => restoredState?.timezoneFilter ?? "all");
  const [summaryView, setSummaryView] = useState<SummaryView>(() => restoredState?.summaryView ?? "action-required");
  const [showLastSynchronizedData, setShowLastSynchronizedData] = useState(() => restoredState?.showLastSynchronizedData ?? false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(() => restoredSession?.lastRefreshedAt ?? null);
  const restoredDateMatches = Boolean(restoredSession?.data) && selectedDate === restoredState?.selectedDate;
  const shouldInitializeReport = !restoredDateMatches;
  const [detailGroup, setDetailGroup] = useState<MonitorGroup | null>(null);
  const [detailTab, setDetailTab] = useState("not-clocked-in");
  const [markNoShowShift, setMarkNoShowShift] = useState<MonitorShift | null>(null);
  const [noShowNote, setNoShowNote] = useState("");
  const [contactShift, setContactShift] = useState<MonitorShift | null>(null);
  const [resolveShift, setResolveShift] = useState<MonitorShift | null>(null);
  const [resolutionDisposition, setResolutionDisposition] = useState<NoShowFinalDisposition>("Other");
  const [resolutionNote, setResolutionNote] = useState("");

  const monitorUrl = useMemo(() => {
    const from = easternWallTimeToIso(selectedDate, "00:00");
    const to = easternWallTimeToIso(selectedDate, "23:59");
    return `/api/scheduling/no-show-monitor?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [selectedDate]);

  const monitorQuery = useQuery<MonitorResponse>({
    queryKey: [monitorUrl, reportSessionId],
    queryFn: () => fetchNoShowMonitor(monitorUrl),
    initialData: restoredDateMatches ? restoredSession?.data : undefined,
    enabled: shouldInitializeReport,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (selectedDate !== restoredState?.selectedDate) {
      setShowLastSynchronizedData(false);
    }
  }, [selectedDate, restoredState?.selectedDate]);

  const refreshMonitor = () => {
    setShowLastSynchronizedData(false);
    setLastRefreshedAt(new Date().toISOString());
    void monitorQuery.refetch();
  };
  const refreshError = monitorQuery.error as NoShowRefreshError | null;
  const liveRefreshFailed = monitorQuery.isError && refreshError?.code === "WIW_LIVE_REFRESH_FAILED";
  const isRefreshingWiw = monitorQuery.isFetching;
  const canShowMonitorData =
    Boolean(monitorQuery.data) &&
    !isRefreshingWiw &&
    (!monitorQuery.isError || showLastSynchronizedData);
  const lastSuccessfulSyncAt =
    refreshError?.lastSuccessfulSyncAt ?? latestSuccessfulSync(monitorQuery.data);

  const markNoShowMutation = useMutation({
    mutationFn: async (shift: MonitorShift) => {
      const response = await apiRequest("POST", "/api/scheduling/no-show-monitor/mark-no-show", {
        shiftId: shift.shift_id,
        driverId: shift.driver_id,
        note: noShowNote.trim() || null,
      });
      return response.json() as Promise<{ action: MonitorShift["manual_no_show"] & { already_marked: boolean } }>;
    },
    onSuccess: (result, shift) => {
      setDetailGroup((current) => current ? {
        ...current,
        shifts: current.shifts.map((item) => item.shift_id === shift.shift_id && item.driver_id === shift.driver_id
          ? {
              ...item,
              manual_no_show: result.action
                ? {
                    marked_at: result.action.marked_at,
                    marked_by: result.action.marked_by,
                    note: result.action.note,
                  }
                : item.manual_no_show,
            }
          : item),
      } : current);
      queryClient.invalidateQueries({ queryKey: [monitorUrl] });
      setMarkNoShowShift(null);
      setNoShowNote("");
      toast({
        title: result.action?.already_marked ? "No Show was already marked" : "No Show marked",
        description: `${shift.driver_name}'s WIW shift history was not changed.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not mark No Show",
        description: error.message || "The Dispatch action was not recorded.",
        variant: "destructive",
      });
    },
  });

  const contactAttemptMutation = useMutation({
    mutationFn: async (shift: MonitorShift) => {
      const response = await apiRequest("POST", "/api/scheduling/no-show-monitor/contact-attempt", {
        shiftId: shift.shift_id,
        driverId: shift.driver_id,
      });
      return response.json();
    },
    onSuccess: (_result, shift) => {
      queryClient.invalidateQueries({ queryKey: [monitorUrl] });
      setContactShift(shift);
    },
    onError: (error: Error, shift) => {
      toast({
        title: "Contact audit was not recorded",
        description: error.message || "Opening the existing email composer without an audit record.",
        variant: "destructive",
      });
      setContactShift(shift);
    },
  });

  const resolveExceptionMutation = useMutation({
    mutationFn: async (shift: MonitorShift) => {
      const response = await apiRequest("POST", "/api/scheduling/no-show-monitor/resolve", {
        shiftId: shift.shift_id,
        driverId: shift.driver_id,
        disposition: resolutionDisposition,
        note: resolutionNote.trim() || null,
      });
      return response.json() as Promise<{ action: { action_timestamp: string | null; final_disposition: string | null; already_resolved?: boolean } }>;
    },
    onSuccess: (result, shift) => {
      setDetailGroup((current) => current ? {
        ...current,
        shifts: current.shifts.map((item) => item.shift_id === shift.shift_id && item.driver_id === shift.driver_id
          ? {
              ...item,
              attendance_status: "Exception Resolved",
              no_show_exception: item.no_show_exception ? {
                ...item.no_show_exception,
                status: "RESOLVED",
                action: "DISPATCH_RESOLVED_EXCEPTION",
                action_timestamp: result.action.action_timestamp,
                final_disposition: result.action.final_disposition,
              } : item.no_show_exception,
            }
          : item),
      } : current);
      queryClient.invalidateQueries({ queryKey: [monitorUrl] });
      setResolveShift(null);
      setResolutionNote("");
      toast({
        title: result.action.already_resolved ? "Exception was already resolved" : "Exception resolved",
        description: result.action.final_disposition ?? "The disposition was recorded in the audit history.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not resolve the exception",
        description: error.message || "The operational disposition was not recorded.",
        variant: "destructive",
      });
    },
  });

  const allShifts = useMemo(
    () => monitorQuery.data?.groups.flatMap((group) => group.shifts) ?? [],
    [monitorQuery.data],
  );

  const filterOptions = useMemo(() => ({
    accounts: [...new Map(allShifts.filter((shift) => shift.account_id).map((shift) => [shift.account_id, shift.account_name ?? "Unnamed account"])).entries()]
      .sort(([, left], [, right]) => left.localeCompare(right)),
    networks: [...new Set(allShifts.map((shift) => shift.network).filter(Boolean) as string[])].sort(),
    timezones: [...new Set(allShifts.map((shift) => shift.wiw_timezone).filter(Boolean) as string[])].sort(),
  }), [allShifts]);

  const visibleGroups = useMemo(() => {
    const groups = monitorQuery.data?.groups ?? [];
    return groups
      .map((group) => {
        const filteredShifts = group.shifts.filter((shift) => {
          const matchesAccount = accountFilter === "all" || shift.account_id === accountFilter;
          const matchesNetwork = networkFilter === "all" || shift.network === networkFilter;
          const matchesTimezone = timezoneFilter === "all" || shift.wiw_timezone === timezoneFilter;
          return matchesAccount && matchesNetwork && matchesTimezone;
        });
        // The operational queue is intentionally Driver + Shift scoped. A
        // clock-in on one shift must not suppress another shift for the same
        // driver, and a group with one exception must not display its
        // clocked-in or grace-period shifts in the default detail view.
        const shifts = summaryView === "action-required"
          ? filteredShifts.filter((shift) => shift.attendance_status === "Not Clocked In / Action Required")
          : filteredShifts;
        const next = filteredGroup(group, shifts);
        return { group: next, status: getGroupStatus(next) };
      })
      .filter(({ group, status }) =>
        group.shifts.length > 0 &&
        (summaryView === "all-start-times" || status === "Action Required"),
      );
  }, [monitorQuery.data, accountFilter, networkFilter, timezoneFilter, summaryView]);

  const metrics = useMemo(() => {
    const groups = visibleGroups.map(({ group }) => group);
    return {
      upcoming: groups.filter((group) => getGroupStatus(group) === "Upcoming").length,
      assigned: groups.reduce((sum, group) => sum + group.assigned_driver_count, 0),
      clockedIn: groups.reduce((sum, group) => sum + group.clocked_in_count, 0),
      notClockedIn: groups.reduce((sum, group) => sum + group.not_clocked_in_count, 0),
      actionRequired: groups.filter((group) => getGroupStatus(group) === "Action Required").length,
      grace: groups.reduce((sum, group) => sum + group.grace_period_count, 0),
    };
  }, [visibleGroups]);

  const hasFilters =
    accountFilter !== "all" ||
    networkFilter !== "all" ||
    timezoneFilter !== "all" ||
    summaryView !== "action-required";
  const reportState = useMemo<NoShowReportState>(() => ({
    selectedDate,
    accountFilter,
    networkFilter,
    timezoneFilter,
    summaryView,
    showLastSynchronizedData,
  }), [selectedDate, accountFilter, networkFilter, timezoneFilter, summaryView, showLastSynchronizedData]);

  useEffect(() => {
    if (!monitorQuery.data || monitorQuery.isFetching) return;

    const refreshedAt = lastRefreshedAt ?? new Date().toISOString();
    if (!lastRefreshedAt) setLastRefreshedAt(refreshedAt);
    writeSchedulingReportSession("no-show", reportSessionId, {
      state: reportState,
      data: monitorQuery.data,
      lastRefreshedAt: refreshedAt,
    });
  }, [lastRefreshedAt, monitorQuery.data, monitorQuery.isFetching, reportSessionId, reportState]);

  const clearFilters = () => {
    setAccountFilter("all");
    setNetworkFilter("all");
    setTimezoneFilter("all");
    setSummaryView("action-required");
  };
  const openDetails = (group: MonitorGroup) => {
    setDetailGroup(group);
    setDetailTab("not-clocked-in");
  };

  return (
    <div className="space-y-5" data-testid="noshow-tab">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold" data-testid="text-noshow-title">No Show Monitor</h3>
            <Badge variant="outline" className="font-normal">Live WIW attendance</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Dispatch view of assigned shifts, led by Eastern Time. No Show classification requires Dispatch confirmation.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span data-testid="text-noshow-last-updated">
            Last Refreshed: {formatSyncTimestamp(lastRefreshedAt ?? monitorQuery.data?.evaluated_at)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshMonitor}
            disabled={isRefreshingWiw}
            data-testid="button-refresh-noshow"
          >
            Refresh
          </Button>
        </div>
      </div>

      {isRefreshingWiw && (
        <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-primary" data-testid="text-noshow-refreshing">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing WIW attendance data…
        </div>
      )}

      {liveRefreshFailed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="alert" data-testid="alert-noshow-refresh-failed">
          <div>
            <p className="font-medium">
              Live WIW refresh failed. No Show results may be based on data last synchronized at {formatSyncTimestamp(lastSuccessfulSyncAt)}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={refreshMonitor} disabled={isRefreshingWiw} data-testid="button-retry-noshow-refresh">
                Retry
              </Button>
              {monitorQuery.data && !showLastSynchronizedData && (
                <Button variant="ghost" size="sm" onClick={() => setShowLastSynchronizedData(true)} data-testid="button-view-last-synchronized-noshow">
                  Continue viewing last synchronized data
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {canShowMonitorData && monitorQuery.data?.data_freshness?.freshness_warning && (
        <div className={cn(
          "rounded-md border px-3 py-2 text-xs",
          monitorQuery.data.data_freshness.is_stale
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
        )}>
          <span>{monitorQuery.data.data_freshness.freshness_warning}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="noshow-summary-cards">
        <MetricCard label="Upcoming Start Times" value={metrics.upcoming} tone="muted" loading={isRefreshingWiw} testId="upcoming" />
        <MetricCard label="Drivers Assigned" value={metrics.assigned} tone="blue" loading={isRefreshingWiw} testId="assigned" />
        <MetricCard label="Clocked In" value={metrics.clockedIn} tone="green" loading={isRefreshingWiw} testId="clocked-in" />
        <MetricCard label="Not Clocked In (3+ min)" value={metrics.notClockedIn} tone="red" loading={isRefreshingWiw} testId="not-clocked-in" />
        <MetricCard label="Action Required" value={metrics.actionRequired} tone="amber" loading={isRefreshingWiw} testId="action-required" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Shift Start Groups</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                One row per exact scheduled start instant · {metrics.grace} driver{metrics.grace === 1 ? "" : "s"} in grace
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {visibleGroups.length} group{visibleGroups.length === 1 ? "" : "s"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2.5" data-testid="noshow-filters">
            <div className="space-y-1.5">
              <Label htmlFor="noshow-date" className="text-xs">Date (ET)</Label>
              <Input id="noshow-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} data-testid="input-noshow-date" />
            </div>
            <FilterSelect label="Account" value={accountFilter} onChange={setAccountFilter} options={filterOptions.accounts.map(([value, label]) => ({ value: value!, label }))} testId="select-noshow-account" />
            <FilterSelect label="Network" value={networkFilter} onChange={setNetworkFilter} options={filterOptions.networks.map((value) => ({ value, label: value }))} testId="select-noshow-network" />
            <FilterSelect label="Time Zone" value={timezoneFilter} onChange={setTimezoneFilter} options={filterOptions.timezones.map((value) => ({ value, label: value }))} testId="select-noshow-timezone" />
            <div className="space-y-1.5">
              <Label className="text-xs">Summary View</Label>
              <div className="flex rounded-md border bg-muted/30 p-0.5" role="group" aria-label="No Show summary view">
                <Button
                  type="button"
                  variant={summaryView === "action-required" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setSummaryView("action-required")}
                  aria-pressed={summaryView === "action-required"}
                  data-testid="button-noshow-action-required"
                >
                  Action Required
                </Button>
                <Button
                  type="button"
                  variant={summaryView === "all-start-times" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setSummaryView("all-start-times")}
                  aria-pressed={summaryView === "all-start-times"}
                  data-testid="button-noshow-all-start-times"
                >
                  All Start Times
                </Button>
              </div>
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs" data-testid="button-clear-noshow-filters">
              Clear filters
            </Button>
          )}

          {monitorQuery.isError && !liveRefreshFailed && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm font-medium">Could not load the No Show Monitor</p>
              <p className="mt-1 text-xs text-muted-foreground">Retry the request to load current WIW attendance.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={refreshMonitor} data-testid="button-retry-noshow">Retry</Button>
            </div>
          )}
          {isRefreshingWiw && !monitorQuery.isError && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Refreshing WIW attendance data…
            </div>
          )}
          {canShowMonitorData && visibleGroups.length === 0 && (
            <div className="rounded-md border border-dashed p-10 text-center" data-testid="text-no-noshow-groups">
              <p className="text-sm font-medium">No shift start groups currently require Dispatch attention.</p>
              {hasFilters && <p className="mt-1 text-xs text-muted-foreground">Try clearing one or more filters.</p>}
            </div>
          )}
          {canShowMonitorData && visibleGroups.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[980px] [&_th]:py-2 [&_td]:py-2" data-testid="table-noshow-start-groups">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Dispatch Time (ET)</TableHead>
                    <TableHead>Local Start Time(s)</TableHead>
                    <TableHead>Time Zone(s)</TableHead>
                    <TableHead className="text-right">Drivers Assigned</TableHead>
                    <TableHead className="text-right">Clocked In</TableHead>
                    <TableHead className="text-right">Grace Period</TableHead>
                    <TableHead className="text-right">Not Clocked In (3+ min)</TableHead>
                    <TableHead className="text-right">% Not Clocked In</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleGroups.map(({ group, status }) => {
                    const notClockedPercentage = group.assigned_driver_count > 0
                      ? Math.round((group.not_clocked_in_count / group.assigned_driver_count) * 100)
                      : 0;
                    return (
                      <TableRow
                        key={group.shift_start_utc}
                        className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                        onClick={() => openDetails(group)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetails(group);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        data-testid={`row-noshow-group-${group.shift_start_utc}`}
                      >
                        <TableCell className="whitespace-nowrap font-semibold">{formatDispatchStartEt(group.dispatch_start_time_et)}</TableCell>
                        <TableCell className="max-w-[180px] text-xs">{localStartNames(group)}</TableCell>
                        <TableCell className="max-w-[170px] text-xs text-muted-foreground">{timezoneNames(group)}</TableCell>
                        <TableCell className="text-right font-medium">{group.assigned_driver_count}</TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-300">{group.clocked_in_count}</TableCell>
                        <TableCell className="text-right text-amber-700 dark:text-amber-300">{group.grace_period_count}</TableCell>
                        <TableCell className={cn("text-right", group.not_clocked_in_count > 0 && "font-semibold text-destructive")}>{group.not_clocked_in_count}</TableCell>
                        <TableCell className="text-right">{notClockedPercentage}%</TableCell>
                        <TableCell>{statusBadge(status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailGroup)} onOpenChange={(open) => !open && setDetailGroup(null)}>
        <DialogContent className="max-w-6xl" data-testid="dialog-noshow-details">
          {detailGroup && (
            <>
              <DialogHeader>
                <DialogTitle>Shift Details · {formatDispatchStartEt(detailGroup.dispatch_start_time_et)}</DialogTitle>
                <DialogDescription>
                  Dispatch start time in ET · {localStartNames(detailGroup)} local · {timezoneNames(detailGroup)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/25 p-3 text-sm md:grid-cols-4">
                <DetailMetric label="Accounts" value={accountNames(detailGroup)} />
                <DetailMetric label="Drivers Assigned" value={detailGroup.assigned_driver_count} />
                <DetailMetric label="Clocked In" value={detailGroup.clocked_in_count} tone="text-emerald-700 dark:text-emerald-300" />
                <DetailMetric label="Not Clocked In" value={detailGroup.not_clocked_in_count} tone={detailGroup.not_clocked_in_count > 0 ? "text-destructive" : undefined} />
                <DetailMetric label="Grace Period" value={detailGroup.grace_period_count} tone="text-amber-700 dark:text-amber-300" />
                <DetailMetric label="Local Shift Start(s)" value={localStartNames(detailGroup)} />
                <DetailMetric label="Time Zone(s)" value={timezoneNames(detailGroup)} />
                <DetailMetric label="Dispatch Start (ET)" value={formatDispatchStartEt(detailGroup.dispatch_start_time_et)} />
              </div>
              <Tabs value={detailTab} onValueChange={setDetailTab} className="min-w-0">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="not-clocked-in" data-testid="tab-noshow-detail-not-clocked-in">
                    Not Clocked In ({detailGroup.shifts.filter((shift) => shift.attendance_status !== "Clocked In" && shift.attendance_status !== "Clocked In Late").length})
                  </TabsTrigger>
                  <TabsTrigger value="clocked-in" data-testid="tab-noshow-detail-clocked-in">
                    Clocked In ({detailGroup.clocked_in_count})
                  </TabsTrigger>
                  <TabsTrigger value="all-assigned" data-testid="tab-noshow-detail-all-assigned">
                    All Assigned ({detailGroup.assigned_driver_count})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="not-clocked-in" className="mt-4">
                  <div className="max-h-[50vh] overflow-auto rounded-md border">
                    <Table className="min-w-[1300px]" data-testid="table-noshow-detail-not-clocked-in">
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Driver</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Shift Start Local</TableHead>
                          <TableHead>Shift Start ET</TableHead>
                          <TableHead>Grace Period Ends</TableHead>
                          <TableHead>Clock-In Time</TableHead>
                          <TableHead className="text-right">Minutes Past Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailGroup.shifts.filter((shift) => shift.attendance_status !== "Clocked In" && shift.attendance_status !== "Clocked In Late").map((shift) => (
                          <TableRow key={shift.shift_id} data-testid={`row-noshow-detail-${shift.shift_id}`}>
                            <TableCell>
                              <Link href={`/drivers/${shift.driver_id}`} className="font-medium text-primary hover:underline">{shift.driver_name}</Link>
                              <div className="text-xs text-muted-foreground">{shift.worker_classification ?? "Unknown"}</div>
                            </TableCell>
                            <TableCell>{shift.account_id ? <Link href={`/customers/${shift.account_id}`} className="text-primary hover:underline">{shift.account_name ?? "Account"}</Link> : "Account mapping pending"}</TableCell>
                            <TableCell>{shift.shift_start_local ?? "Local timezone pending"}</TableCell>
                            <TableCell>{shift.shift_start_et}</TableCell>
                            <TableCell>{shift.grace_period_end_et}</TableCell>
                            <TableCell>{shift.clock_in_time_et ?? "—"}</TableCell>
                            <TableCell className="text-right">{minutesPastDue(shift)}</TableCell>
                            <TableCell>{attendanceBadge(shift)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                              <Button variant="outline" size="sm" asChild><Link href={`/drivers/${shift.driver_id}`} data-testid={`link-noshow-view-driver-${shift.shift_id}`}>View Driver</Link></Button>
                                <Button variant="outline" size="sm" asChild><Link href={`/drivers/${shift.driver_id}?tab=scheduling`} data-testid={`link-noshow-view-schedule-${shift.shift_id}`}>View Schedule</Link></Button>
                              <Button variant="outline" size="sm" onClick={() => contactAttemptMutation.mutate(shift)} disabled={contactAttemptMutation.isPending || shift.attendance_status !== "Not Clocked In / Action Required"} data-testid={`button-noshow-contact-${shift.shift_id}`}>Contact</Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => { setResolveShift(shift); setResolutionDisposition("Other"); setResolutionNote(""); }}
                                  disabled={shift.attendance_status !== "Not Clocked In / Action Required"}
                                  data-testid={`button-noshow-resolve-${shift.shift_id}`}
                                >
                                  Resolve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => { setMarkNoShowShift(shift); setNoShowNote(""); }}
                                  disabled={shift.attendance_status !== "Not Clocked In / Action Required" || Boolean(shift.manual_no_show)}
                                  data-testid={`button-noshow-mark-${shift.shift_id}`}
                                >
                                  {shift.manual_no_show ? "Marked" : "Mark No Show"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="clocked-in" className="mt-4">
                  <div className="max-h-[50vh] overflow-auto rounded-md border">
                    <Table className="min-w-[960px]" data-testid="table-noshow-detail-clocked-in">
                      <TableHeader><TableRow className="bg-muted/40"><TableHead>Driver</TableHead><TableHead>Account</TableHead><TableHead>Scheduled Start</TableHead><TableHead>Actual Clock-In</TableHead><TableHead>Variance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {detailGroup.shifts.filter((shift) => shift.attendance_status === "Clocked In" || shift.attendance_status === "Clocked In Late").map((shift) => (
                          <TableRow key={shift.shift_id}>
                            <TableCell><Link href={`/drivers/${shift.driver_id}`} className="font-medium text-primary hover:underline">{shift.driver_name}</Link></TableCell>
                            <TableCell>{shift.account_id ? <Link href={`/customers/${shift.account_id}`} className="text-primary hover:underline">{shift.account_name ?? "Account"}</Link> : "Account mapping pending"}</TableCell>
                            <TableCell>{shift.shift_start_local ?? shift.shift_start_et}</TableCell>
                            <TableCell>{shift.clock_in_time_local ?? shift.clock_in_time_et ?? "—"}</TableCell>
                            <TableCell>{clockInVariance(shift)}</TableCell>
                            <TableCell>{attendanceBadge(shift)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="all-assigned" className="mt-4">
                  <div className="max-h-[50vh] overflow-auto rounded-md border">
                    <Table className="min-w-[1080px]" data-testid="table-noshow-detail-all-assigned">
                      <TableHeader><TableRow className="bg-muted/40"><TableHead>Driver</TableHead><TableHead>Account</TableHead><TableHead>Worker Type</TableHead><TableHead>Local Shift Start</TableHead><TableHead>Dispatch Start (ET)</TableHead><TableHead>Clock-In</TableHead><TableHead>Status</TableHead><TableHead>Dispatch Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {detailGroup.shifts.map((shift) => (
                          <TableRow key={shift.shift_id}>
                            <TableCell><Link href={`/drivers/${shift.driver_id}`} className="font-medium text-primary hover:underline">{shift.driver_name}</Link></TableCell>
                            <TableCell>{shift.account_id ? <Link href={`/customers/${shift.account_id}`} className="text-primary hover:underline">{shift.account_name ?? "Account"}</Link> : "Account mapping pending"}</TableCell>
                            <TableCell>{shift.worker_classification ?? "Unknown"}</TableCell>
                            <TableCell>{shift.shift_start_local ?? "Local timezone pending"}</TableCell>
                            <TableCell>{shift.shift_start_et}</TableCell>
                            <TableCell>{shift.clock_in_time_local ?? "—"}</TableCell>
                            <TableCell>{attendanceBadge(shift)}</TableCell>
                            <TableCell>{shift.manual_no_show ? "Marked No Show" : shift.attendance_status === "Not Clocked In / Action Required" ? "Requires Dispatch review" : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(markNoShowShift)} onOpenChange={(open) => !open && !markNoShowMutation.isPending && setMarkNoShowShift(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-confirm-noshow">
          {markNoShowShift && (
            <>
              <DialogHeader>
                <DialogTitle>Mark No Show?</DialogTitle>
                <DialogDescription>
                  Confirm that {markNoShowShift.driver_name} did not clock in for the shift beginning {markNoShowShift.shift_start_et}. This is a Dispatch action, not an automatic classification.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="noshow-note">Dispatch note (optional)</Label>
                <Textarea id="noshow-note" value={noShowNote} onChange={(event) => setNoShowNote(event.target.value)} maxLength={4000} placeholder="Add any confirmation or outreach details…" data-testid="textarea-noshow-note" />
                <p className="text-xs text-muted-foreground">The original WIW shift and clock-in history will not be changed.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMarkNoShowShift(null)} disabled={markNoShowMutation.isPending}>Cancel</Button>
                <Button variant="destructive" onClick={() => markNoShowMutation.mutate(markNoShowShift)} disabled={markNoShowMutation.isPending} data-testid="button-confirm-noshow">
                  {markNoShowMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Confirm Mark No Show
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolveShift)} onOpenChange={(open) => !open && !resolveExceptionMutation.isPending && setResolveShift(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-resolve-noshow-exception">
          {resolveShift && (
            <>
              <DialogHeader>
                <DialogTitle>Resolve Action Required</DialogTitle>
                <DialogDescription>
                  Record the final disposition for {resolveShift.driver_name}. This closes the active exception and retains the audit history.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="noshow-disposition">Final disposition</Label>
                  <Select value={resolutionDisposition} onValueChange={(value) => setResolutionDisposition(value as NoShowFinalDisposition)}>
                    <SelectTrigger id="noshow-disposition" data-testid="select-noshow-disposition"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Clocked In">Clocked In</SelectItem>
                      <SelectItem value="Late / Clocked In">Late / Clocked In</SelectItem>
                      <SelectItem value="Schedule Error">Schedule Error</SelectItem>
                      <SelectItem value="Clock-In Issue">Clock-In Issue</SelectItem>
                      <SelectItem value="Shift Cancelled">Shift Cancelled</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="noshow-resolution-note">Dispatch note (optional)</Label>
                  <Textarea id="noshow-resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} maxLength={4000} placeholder="Document the resolution…" data-testid="textarea-noshow-resolution-note" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResolveShift(null)} disabled={resolveExceptionMutation.isPending}>Cancel</Button>
                <Button onClick={() => resolveExceptionMutation.mutate(resolveShift)} disabled={resolveExceptionMutation.isPending} data-testid="button-confirm-noshow-resolution">
                  {resolveExceptionMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Record Resolution
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {contactShift && (
        <DriverEmailComposeDialog
          open={Boolean(contactShift)}
          onClose={() => setContactShift(null)}
          driverId={contactShift.driver_id}
          driverName={contactShift.driver_name}
          driverEmail={contactShift.driver_email ?? ""}
        />
      )}
    </div>
  );
}

function DetailMetric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("truncate text-sm font-medium", tone)} title={String(value)}>{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  loading,
  testId,
}: {
  label: string;
  value: number;
  tone: "muted" | "blue" | "green" | "red" | "amber";
  loading: boolean;
  testId: string;
}) {
  const toneClasses = {
    muted: "text-muted-foreground",
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  return (
    <Card data-testid={`card-noshow-${testId}`}>
      <CardContent className="p-3.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("mt-2 text-2xl font-bold", toneClasses[tone])} data-testid={`text-noshow-count-${testId}`}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: FilterValue;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs" data-testid={testId}>
          <SelectValue placeholder={`All ${label}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {label}s</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}