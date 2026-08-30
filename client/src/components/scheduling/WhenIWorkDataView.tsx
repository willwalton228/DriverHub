/**
 * WhenIWorkDataView  (Ticket 7)
 *
 * Exposes the four canonical WIW data sets synced from the API:
 *   Shifts · Clock Times · Absences · Attendance Notices
 *
 * All data comes from the canonical tables (not the file-import pipeline)
 * so it reflects the live API-synced state.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarClock, Timer, CalendarOff, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Info, User, MapPin, Clock,
} from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks } from "date-fns";
import { subDays } from "date-fns";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtTs(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, h:mm a"); }
  catch { return iso; }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy"); }
  catch { return iso; }
}

function fmtMins(mins: number | null) {
  if (mins == null || mins === 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }

const PAGE_SIZE = 25;

function PaginationBar({ page, total, pageSize, loading, onPage }: {
  page: number; total: number; pageSize: number; loading: boolean; onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total.toLocaleString()} records
        {loading && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
      </p>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">
        {msg ?? "No records found for this filter."}
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Shift status badge ─────────────────────────────────────────────────────────

const SHIFT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  unpublished: { label: "Unpublished", cls: "bg-muted text-muted-foreground border-0" },
  published:   { label: "Published",   cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0" },
  started:     { label: "In Progress", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-0" },
  completed:   { label: "Completed",   cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" },
  no_show:     { label: "No Show",     cls: "bg-red-100 dark:bg-red-900/30 text-destructive border-0" },
};

function ShiftStatusBadge({ status }: { status: string }) {
  const s = SHIFT_STATUS_MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-0" };
  return <Badge className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

// ── Absence status badge ───────────────────────────────────────────────────────

const ABS_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" },
  pending:  { label: "Pending",  cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-0" },
  denied:   { label: "Denied",   cls: "bg-red-100 dark:bg-red-900/30 text-destructive border-0" },
};

function AbsStatusBadge({ status }: { status: string }) {
  const s = ABS_STATUS_MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-0" };
  return <Badge className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

// ── Notice type badge ──────────────────────────────────────────────────────────

const NOTICE_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  late:         { label: "Late",         cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-0" },
  no_show:      { label: "No Show",      cls: "bg-red-100 dark:bg-red-900/30 text-destructive border-0" },
  early_leave:  { label: "Early Leave",  cls: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-0" },
  missed_punch: { label: "Missed Punch", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0" },
};

function NoticeTypeBadge({ type }: { type: string }) {
  const s = NOTICE_TYPE_MAP[type] ?? { label: type.replace(/_/g, " "), cls: "bg-muted text-muted-foreground border-0" };
  return <Badge className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

// ── Approval status badge (for times tab) ────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="text-xs bg-green-600 dark:bg-green-700 text-white border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="text-xs bg-destructive text-destructive-foreground border-0">Rejected</Badge>;
  return <Badge variant="secondary" className="text-xs">Unreviewed</Badge>;
}

// ── Date range bar (shared) ───────────────────────────────────────────────────

function DateRangeBar({ start, end, onStart, onEnd, children }: {
  start: string; end: string;
  onStart: (v: string) => void; onEnd: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Date range</Label>
        <Input type="date" value={start} onChange={(e) => onStart(e.target.value)} className="h-8 text-sm w-36" />
        <span className="text-xs text-muted-foreground">→</span>
        <Input type="date" value={end} onChange={(e) => onEnd(e.target.value)} className="h-8 text-sm w-36" />
      </div>
      {children}
    </div>
  );
}

// ── 1. Shifts sub-tab ─────────────────────────────────────────────────────────

function ShiftsTab() {
  const [start, setStart]   = useState(() => isoDate(subDays(new Date(), 14)));
  const [end, setEnd]       = useState(() => isoDate(new Date()));
  const [status, setStatus] = useState("all");
  const [page, setPage]     = useState(1);

  const params = new URLSearchParams({ start, end, status, page: String(page), pageSize: String(PAGE_SIZE) });
  const { data, isLoading, isError, isFetching, refetch } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/shifts", start, end, status, page],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/shifts?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load shifts");
      return res.json();
    },
  });

  const records = data?.records ?? [];
  const total   = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <DateRangeBar start={start} end={end} onStart={(v) => { setStart(v); setPage(1); }} onEnd={(v) => { setEnd(v); setPage(1); }}>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unpublished">Unpublished</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="started">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </DateRangeBar>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Start</TableHead>
              <TableHead className="text-xs">End</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Location</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <SkeletonRows cols={9} /> : isError ? (
              <TableRow><TableCell colSpan={9} className="py-6 text-center"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />Unable to load shifts.<Button variant="ghost" size="sm" className="h-auto p-0 text-sm ml-1" onClick={() => refetch()}>Retry</Button></div></TableCell></TableRow>
            ) : records.length === 0
              ? <EmptyRow cols={9} />
              : records.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-shift-${r.id}`}>
                  <TableCell className="text-sm font-medium">{r.driver_name ?? r.wiw_user_name ?? "Unassigned"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.start_time)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.start_time ? format(parseISO(r.start_time), "h:mm a") : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.end_time ? format(parseISO(r.end_time), "h:mm a") : "—"}</TableCell>
                  <TableCell className="text-sm">{fmtMins(r.scheduled_minutes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.location_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.position_name ?? "—"}</TableCell>
                  <TableCell><ShiftStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.is_open ? "Open" : "—"}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
      <PaginationBar page={page} total={total} pageSize={PAGE_SIZE} loading={isFetching} onPage={setPage} />
    </div>
  );
}

// ── 2. Clock Times sub-tab ────────────────────────────────────────────────────

function TimesTab() {
  const [start, setStart]   = useState(() => isoDate(subDays(new Date(), 14)));
  const [end, setEnd]       = useState(() => isoDate(new Date()));
  const [status, setStatus] = useState("all");
  const [page, setPage]     = useState(1);

  const params = new URLSearchParams({ start, end, status, page: String(page), pageSize: String(PAGE_SIZE) });
  const { data, isLoading, isError, isFetching, refetch } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/times", status, start, end, page],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/times?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load times");
      return res.json();
    },
  });

  const records = data?.records ?? [];
  const total   = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <DateRangeBar start={start} end={end} onStart={(v) => { setStart(v); setPage(1); }} onEnd={(v) => { setEnd(v); setPage(1); }}>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </DateRangeBar>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Clock In</TableHead>
              <TableHead className="text-xs">Clock Out</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Clock Out Type</TableHead>
              <TableHead className="text-xs">Approval</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <SkeletonRows cols={7} /> : isError ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />Unable to load clock times.<Button variant="ghost" size="sm" className="h-auto p-0 text-sm ml-1" onClick={() => refetch()}>Retry</Button></div></TableCell></TableRow>
            ) : records.length === 0
              ? <EmptyRow cols={7} />
              : records.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-time-view-${r.id}`}>
                  <TableCell className="text-sm font-medium">{r.driver_name ?? r.wiw_user_name ?? "Unknown"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtTs(r.clock_in)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtTs(r.clock_out)}</TableCell>
                  <TableCell className="text-sm">{fmtMins(r.total_minutes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.auto_clock_out
                      ? <span className="text-amber-600 dark:text-amber-400 text-xs">Auto</span>
                      : <span className="text-xs">Manual</span>}
                  </TableCell>
                  <TableCell><ApprovalBadge status={r.approval_status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
      <PaginationBar page={page} total={total} pageSize={PAGE_SIZE} loading={isFetching} onPage={setPage} />
    </div>
  );
}

// ── 3. Absences sub-tab ───────────────────────────────────────────────────────

function AbsencesTab() {
  const [start, setStart]   = useState(() => isoDate(subDays(new Date(), 30)));
  const [end, setEnd]       = useState(() => isoDate(new Date()));
  const [status, setStatus] = useState("all");
  const [page, setPage]     = useState(1);

  const params = new URLSearchParams({ start, end, status, page: String(page), pageSize: String(PAGE_SIZE) });
  const { data, isLoading, isError, isFetching, refetch } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/absences", start, end, status, page],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/absences?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load absences");
      return res.json();
    },
  });

  const records = data?.records ?? [];
  const total   = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <DateRangeBar start={start} end={end} onStart={(v) => { setStart(v); setPage(1); }} onEnd={(v) => { setEnd(v); setPage(1); }}>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </DateRangeBar>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <SkeletonRows cols={6} /> : isError ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />Unable to load absences.<Button variant="ghost" size="sm" className="h-auto p-0 text-sm ml-1" onClick={() => refetch()}>Retry</Button></div></TableCell></TableRow>
            ) : records.length === 0
              ? <EmptyRow cols={6} msg="No absences found for this period." />
              : records.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-absence-${r.id}`}>
                  <TableCell className="text-sm font-medium">{r.driver_name ?? r.wiw_user_name ?? "Unknown"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-sm">{fmtMins(r.duration_minutes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                  <TableCell><AbsStatusBadge status={r.status ?? "pending"} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
      <PaginationBar page={page} total={total} pageSize={PAGE_SIZE} loading={isFetching} onPage={setPage} />
    </div>
  );
}

// ── 4. Attendance Notices sub-tab ─────────────────────────────────────────────

function NoticesTab() {
  const [start, setStart] = useState(() => isoDate(subDays(new Date(), 30)));
  const [end, setEnd]     = useState(() => isoDate(new Date()));
  const [type, setType]   = useState("all");
  const [page, setPage]   = useState(1);

  const params = new URLSearchParams({ start, end, type, page: String(page), pageSize: String(PAGE_SIZE) });
  const { data, isLoading, isError, isFetching, refetch } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/notices", start, end, type, page],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/notices?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notices");
      return res.json();
    },
  });

  const records = data?.records ?? [];
  const total   = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <DateRangeBar start={start} end={end} onStart={(v) => { setStart(v); setPage(1); }} onEnd={(v) => { setEnd(v); setPage(1); }}>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
            <SelectItem value="early_leave">Early Leave</SelectItem>
            <SelectItem value="missed_punch">Missed Punch</SelectItem>
          </SelectContent>
        </Select>
      </DateRangeBar>

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Occurred At</TableHead>
              <TableHead className="text-xs">Minutes Late</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <SkeletonRows cols={5} /> : isError ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />Unable to load attendance notices.<Button variant="ghost" size="sm" className="h-auto p-0 text-sm ml-1" onClick={() => refetch()}>Retry</Button></div></TableCell></TableRow>
            ) : records.length === 0
              ? <EmptyRow cols={5} msg="No attendance notices found for this period." />
              : records.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-notice-${r.id}`}>
                  <TableCell className="text-sm font-medium">{r.driver_name ?? r.wiw_user_name ?? "Unknown"}</TableCell>
                  <TableCell><NoticeTypeBadge type={r.type} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtTs(r.occurred_at)}</TableCell>
                  <TableCell className="text-sm">
                    {r.minutes_late != null && r.minutes_late > 0
                      ? <span className="text-amber-600 dark:text-amber-400">{r.minutes_late}m</span>
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
      <PaginationBar page={page} total={total} pageSize={PAGE_SIZE} loading={isFetching} onPage={setPage} />
    </div>
  );
}

// ── Summary KPI bar ───────────────────────────────────────────────────────────

function SummaryKpis() {
  const { data: syncStatus } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/sync/status"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/sync/status", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: counts } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/data/counts"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/data/counts", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Shifts",   value: syncStatus?.shiftsCount  ?? counts?.shifts  ?? 0, icon: CalendarClock },
        { label: "Times",    value: syncStatus?.timesCount   ?? counts?.times   ?? 0, icon: Timer        },
        { label: "Absences", value: counts?.absences ?? 0,                             icon: CalendarOff  },
        { label: "Notices",  value: counts?.notices  ?? 0,                             icon: AlertTriangle},
      ].map(({ label, value, icon: Icon }) => (
        <div key={label} className="p-3 rounded-lg bg-muted/50 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3 w-3" />
            {label} Stored
          </div>
          {counts === undefined && syncStatus === undefined
            ? <Skeleton className="h-6 w-12" />
            : <p className="text-xl font-bold">{Number(value).toLocaleString()}</p>
          }
        </div>
      ))}
    </div>
  );
}

// ── Driver Schedule Preview ───────────────────────────────────────────────────

const SHIFT_STATUS_COLORS: Record<string, string> = {
  unpublished: "bg-muted text-muted-foreground",
  published:   "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
  started:     "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200",
  completed:   "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  no_show:     "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
};

function ShiftCard({ shift }: { shift: any }) {
  const start = shift.start_time ? parseISO(shift.start_time) : null;
  const end   = shift.end_time   ? parseISO(shift.end_time)   : null;
  const color = SHIFT_STATUS_COLORS[shift.status] ?? "bg-muted text-muted-foreground";

  return (
    <div className={`rounded-md px-2 py-1.5 text-xs space-y-0.5 ${color}`} data-testid={`shift-card-${shift.id}`}>
      <div className="font-medium flex items-center gap-1 flex-wrap">
        <Clock className="h-3 w-3 shrink-0" />
        <span>
          {start ? format(start, "h:mm a") : "?"} – {end ? format(end, "h:mm a") : "?"}
        </span>
        {shift.scheduled_minutes != null && (
          <span className="opacity-70">({fmtMins(shift.scheduled_minutes)})</span>
        )}
      </div>
      {shift.position_name && (
        <div className="flex items-center gap-1 opacity-80">
          <User className="h-3 w-3 shrink-0" />
          {shift.position_name}
        </div>
      )}
      {shift.location_name && (
        <div className="flex items-center gap-1 opacity-80">
          <MapPin className="h-3 w-3 shrink-0" />
          {shift.location_name}
        </div>
      )}
    </div>
  );
}

function DriverWeekCard({ driverId, driverName, weekStart }: {
  driverId: string;
  driverName: string;
  weekStart: Date;
}) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const params = new URLSearchParams({
    start:    isoDate(weekStart),
    end:      isoDate(weekEnd),
    driverId,
    pageSize: "100",
    page:     "1",
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/shifts", driverId, isoDate(weekStart)],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/shifts?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!driverId,
  });

  const shifts: any[] = data?.records ?? [];
  const totalHours = shifts.reduce((acc: number, s: any) => acc + (s.scheduled_minutes ?? 0), 0) / 60;

  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-1.5">
            <User className="h-4 w-4 text-muted-foreground" />
            {driverName}
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            {totalHours.toFixed(1)} hrs scheduled
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shifts…
          </div>
        ) : (
          days.map(day => {
            const dayShifts = shifts.filter((s: any) =>
              s.start_time && isSameDay(parseISO(s.start_time), day)
            );
            return (
              <div key={day.toISOString()} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {format(day, "EEE, MMM d")}
                </p>
                {dayShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 pl-1">No shifts</p>
                ) : (
                  dayShifts.map((s: any) => <ShiftCard key={s.id} shift={s} />)
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function DriverSchedulePreview() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [driver1Id, setDriver1Id] = useState("");
  const [driver2Id, setDriver2Id] = useState("");

  // Load WIW users that are mapped to drivers
  const { data: usersData, isLoading: loadingUsers } = useQuery<any>({
    queryKey: ["/api/scheduling/wheniwork/users"],
    queryFn: async () => {
      const res = await fetch("/api/scheduling/wheniwork/users?filter=matched", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  const mappedUsers: any[] = (usersData?.users ?? []).filter((u: any) => u.driver_id);

  const getDriverName = (driverId: string) => {
    const u = mappedUsers.find((u: any) => u.driver_id === driverId);
    return u ? (u.driver_name ?? u.name ?? driverId) : driverId;
  };

  const prevWeek = () => setWeekStart(w => subWeeks(w, 1));
  const nextWeek = () => setWeekStart(w => addWeeks(w, 1));
  const thisWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="space-y-4" data-testid="driver-schedule-preview">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={prevWeek} data-testid="btn-prev-week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {format(weekStart, "MMM d")} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}
          </span>
          <Button size="icon" variant="outline" onClick={nextWeek} data-testid="btn-next-week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={thisWeek} data-testid="btn-this-week">
            This Week
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Driver 1</Label>
          {loadingUsers ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={driver1Id} onValueChange={setDriver1Id} data-testid="select-driver1">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select a driver…" />
              </SelectTrigger>
              <SelectContent>
                {mappedUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>No mapped drivers yet</SelectItem>
                ) : (
                  mappedUsers.map((u: any) => (
                    <SelectItem key={u.driver_id} value={u.driver_id}>
                      {u.driver_name ?? u.name ?? u.driver_id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Driver 2</Label>
          {loadingUsers ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={driver2Id} onValueChange={setDriver2Id} data-testid="select-driver2">
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select a driver…" />
              </SelectTrigger>
              <SelectContent>
                {mappedUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>No mapped drivers yet</SelectItem>
                ) : (
                  mappedUsers.map((u: any) => (
                    <SelectItem key={u.driver_id} value={u.driver_id}>
                      {u.driver_name ?? u.name ?? u.driver_id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {(driver1Id || driver2Id) ? (
        <div className="flex gap-3 items-start flex-wrap">
          {driver1Id && (
            <DriverWeekCard
              driverId={driver1Id}
              driverName={getDriverName(driver1Id)}
              weekStart={weekStart}
            />
          )}
          {driver2Id && (
            <DriverWeekCard
              driverId={driver2Id}
              driverName={getDriverName(driver2Id)}
              weekStart={weekStart}
            />
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border border-dashed py-12 flex flex-col items-center gap-2 text-muted-foreground">
          <CalendarClock className="h-8 w-8 opacity-40" />
          <p className="text-sm">Select one or two drivers above to view their weekly schedule.</p>
          {mappedUsers.length === 0 && !loadingUsers && (
            <p className="text-xs opacity-70">
              No mapped drivers yet — sync WIW users and map them to drivers in the User Mapping tab.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────

export function WhenIWorkDataView() {
  return (
    <div className="space-y-4" data-testid="wiw-data-view">

      <div className="flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Data is sourced from the When I Work API via the Sync engine (Connected Apps tab).
          Use the date range and status filters to navigate each data set.
        </p>
      </div>

      <SummaryKpis />

      <Separator />

      <Tabs defaultValue="driver-preview">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="driver-preview" className="text-xs" data-testid="tab-wiw-driver-preview">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Driver Schedules
          </TabsTrigger>
          <TabsTrigger value="shifts" className="text-xs" data-testid="tab-wiw-shifts">
            <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
            All Shifts
          </TabsTrigger>
          <TabsTrigger value="times" className="text-xs" data-testid="tab-wiw-times">
            <Timer className="h-3.5 w-3.5 mr-1.5" />
            Clock Times
          </TabsTrigger>
          <TabsTrigger value="absences" className="text-xs" data-testid="tab-wiw-absences">
            <CalendarOff className="h-3.5 w-3.5 mr-1.5" />
            Absences
          </TabsTrigger>
          <TabsTrigger value="notices" className="text-xs" data-testid="tab-wiw-notices">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Attendance Notices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="driver-preview" className="mt-4"><DriverSchedulePreview /></TabsContent>
        <TabsContent value="shifts"         className="mt-4"><ShiftsTab   /></TabsContent>
        <TabsContent value="times"          className="mt-4"><TimesTab    /></TabsContent>
        <TabsContent value="absences"       className="mt-4"><AbsencesTab /></TabsContent>
        <TabsContent value="notices"        className="mt-4"><NoticesTab  /></TabsContent>
      </Tabs>
    </div>
  );
}
