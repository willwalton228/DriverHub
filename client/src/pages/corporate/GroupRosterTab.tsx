import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShiftSlot {
  startTime: string;
  endTime: string;
  locationName: string;
}

interface RosterEntry {
  driver_id: string;
  first_name: string;
  last_name: string;
  primary_account_name: string | null;
  wiw_external_user_id: string | null;
  today_shifts: ShiftSlot[] | null;
  availability: "clocked_in" | "scheduled_later" | "not_scheduled";
}

function formatShiftTime(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return "—";
  }
}

function AvailabilityBadge({ status }: { status: RosterEntry["availability"] }) {
  if (status === "clocked_in") {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1"
        data-testid="badge-availability-clocked-in"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        On Shift
      </Badge>
    );
  }
  if (status === "scheduled_later") {
    return (
      <Badge
        className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
        data-testid="badge-availability-scheduled"
      >
        Scheduled Later
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground" data-testid="badge-availability-none">
      Not Scheduled
    </Badge>
  );
}

function ShiftCell({ shifts }: { shifts: ShiftSlot[] | null }) {
  if (!shifts || shifts.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {shifts.map((s, i) => (
        <span key={i} className="text-sm" data-testid={`text-shift-${i}`}>
          {formatShiftTime(s.startTime)}–{formatShiftTime(s.endTime)}
          {s.locationName ? (
            <span className="text-muted-foreground"> ({s.locationName})</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

interface GroupRosterTabProps {
  accountId: string;
}

export function GroupRosterTab({ accountId }: GroupRosterTabProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [search, setSearch] = useState("");

  const {
    data: roster = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<RosterEntry[]>({
    queryKey: ["/api/corporate/customers", accountId, "group-roster", selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/corporate/customers/${accountId}/group-roster?date=${selectedDate}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch group roster");
      return res.json();
    },
  });

  const filtered = roster.filter((r) => {
    if (!search) return true;
    const name = `${r.first_name} ${r.last_name}`.toLowerCase();
    const acct = (r.primary_account_name ?? "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || acct.includes(q);
  });

  const counts = {
    clocked_in: roster.filter((r) => r.availability === "clocked_in").length,
    scheduled_later: roster.filter((r) => r.availability === "scheduled_later").length,
    not_scheduled: roster.filter((r) => r.availability === "not_scheduled").length,
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Group Driver Roster</h2>
          <p className="text-sm text-muted-foreground">
            Consolidated view across all accounts in this group
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
            data-testid="input-roster-date"
          />
          <Input
            placeholder="Search driver or account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52"
            data-testid="input-roster-search"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-roster-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {!isLoading && roster.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1" data-testid="chip-clocked-in-count">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {counts.clocked_in} On Shift
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" data-testid="chip-scheduled-count">
            {counts.scheduled_later} Scheduled Later
          </Badge>
          <Badge variant="outline" className="text-muted-foreground" data-testid="chip-not-scheduled-count">
            {counts.not_scheduled} Not Scheduled
          </Badge>
          <span className="text-xs text-muted-foreground ml-1">
            {roster.length} total active driver{roster.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2" data-testid="state-roster-empty">
              <Users className="h-8 w-8 opacity-30" />
              <p className="text-sm">
                {search
                  ? "No drivers match your search."
                  : "No active drivers found across this group."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-group-roster">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Driver</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Primary Account</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Today's Schedule
                      </span>
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Availability
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, idx) => (
                    <tr
                      key={entry.driver_id}
                      className="border-b last:border-0 hover-elevate"
                      data-testid={`row-roster-driver-${entry.driver_id}`}
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap" data-testid={`text-roster-name-${entry.driver_id}`}>
                        {entry.first_name} {entry.last_name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" data-testid={`text-roster-account-${entry.driver_id}`}>
                        {entry.primary_account_name ?? <span className="italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3" data-testid={`text-roster-schedule-${entry.driver_id}`}>
                        <ShiftCell shifts={entry.today_shifts} />
                      </td>
                      <td className="px-4 py-3" data-testid={`text-roster-availability-${entry.driver_id}`}>
                        <AvailabilityBadge status={entry.availability} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {roster.length} driver{roster.length !== 1 ? "s" : ""}
          {" · "}Availability reflects WIW time clock status
        </p>
      )}
    </div>
  );
}
