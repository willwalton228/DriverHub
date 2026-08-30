/**
 * Needs Coverage Workspace (DH-002053)
 *
 * Live dispatch work-queue of shifts that require replacement driver coverage.
 * Records flow in automatically when a driver responds "Unavailable" to the
 * Saturday weekend-Monday-reminder SMS/email, and can also be created manually.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  User,
  Phone,
  Eye,
  CheckCheck,
  Search,
  CalendarDays,
  Building2,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NeedsCoverageRecord {
  id:                     string;
  shiftId:                string | null;
  driverId:               string | null;
  driverName:             string | null;
  driverClassification:   string | null;
  shiftDate:              string | null;
  startTime:              string | null;
  endTime:                string | null;
  accountName:            string | null;
  reason:                 string | null;
  reportedBy:             string | null;
  dateFlagged:            string;
  status:                 "open" | "in_progress" | "filled" | "cancelled";
  replacementDriverId:    string | null;
  replacementDriverName:  string | null;
  filledAt:               string | null;
  notes:                  string | null;
  sourceType:             "weekend_monday_reminder" | "manual";
  createdAt:              string;
}

interface NeedsCoverageListResponse {
  records: NeedsCoverageRecord[];
  total:   number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(ds: string | null | undefined): string {
  if (!ds) return "—";
  const d = new Date(ds);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

function fmtDatetime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status }: { status: NeedsCoverageRecord["status"] }) {
  const map: Record<string, { label: string; className: string }> = {
    open:        { label: "Open",        className: "bg-amber-100 text-amber-800 border-amber-200" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-800 border-blue-200" },
    filled:      { label: "Filled",      className: "bg-green-100 text-green-800 border-green-200" },
    cancelled:   { label: "Cancelled",   className: "bg-gray-100 text-gray-500 border-gray-200" },
  };
  const cfg = map[status] ?? map.open;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "weekend_monday_reminder") {
    return <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">Auto (SMS)</Badge>;
  }
  return <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">Manual</Badge>;
}

function ClassBadge({ cls }: { cls: string | null }) {
  if (!cls) return <span className="text-muted-foreground text-xs">—</span>;
  if (cls === "Employee") return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">EE</Badge>;
  return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">IC</Badge>;
}

// ── Date preset helpers ────────────────────────────────────────────────────────

type DatePreset = "today" | "tomorrow" | "this_week" | "next_7" | "all";

function getPresetRange(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    const s = toISO(today);
    return { from: s, to: s };
  }
  if (preset === "tomorrow") {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    const s = toISO(d);
    return { from: s, to: s };
  }
  if (preset === "this_week") {
    const day = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    return { from: toISO(mon), to: toISO(sun) };
  }
  if (preset === "next_7") {
    const end = new Date(today); end.setDate(today.getDate() + 6);
    return { from: toISO(today), to: toISO(end) };
  }
  return {};
}

// ── Create/Edit Dialog ─────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
}

function CreateNeedsCoverageDialog({ open, onClose }: CreateDialogProps) {
  const [form, setForm] = useState({
    driverName: "", accountName: "", shiftDate: "", startTime: "", endTime: "",
    driverClassification: "IC", reason: "", notes: "",
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/scheduling/needs-coverage", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["needs-coverage"] });
      toast({ title: "Record created", description: "Needs Coverage record added to the work queue." });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to create record.", variant: "destructive" }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Flag Shift — Needs Coverage</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Driver Name</Label>
              <Input placeholder="Full name" value={form.driverName} onChange={set("driverName")} />
            </div>
            <div className="space-y-1">
              <Label>Classification</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={form.driverClassification}
                onChange={set("driverClassification")}
              >
                <option value="IC">IC</option>
                <option value="Employee">Employee</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Account / Location</Label>
            <Input placeholder="Account name" value={form.accountName} onChange={set("accountName")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Shift Date</Label>
              <Input type="date" value={form.shiftDate} onChange={set("shiftDate")} />
            </div>
            <div className="space-y-1">
              <Label>Start Time</Label>
              <Input type="time" value={form.startTime} onChange={set("startTime")} />
            </div>
            <div className="space-y-1">
              <Label>End Time</Label>
              <Input type="time" value={form.endTime} onChange={set("endTime")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Textarea placeholder="Why is coverage needed?" value={form.reason} onChange={set("reason")} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea placeholder="Internal notes" value={form.notes} onChange={set("notes")} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending || !form.driverName || !form.shiftDate}
          >
            {createMutation.isPending ? "Creating…" : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Update Status Dialog ───────────────────────────────────────────────────────

interface UpdateDialogProps {
  record: NeedsCoverageRecord | null;
  onClose: () => void;
}

function UpdateStatusDialog({ record, onClose }: UpdateDialogProps) {
  const [status, setStatus] = useState<string>(record?.status ?? "open");
  const [replacementName, setReplacementName] = useState(record?.replacementDriverName ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: { status: string; replacementDriverName?: string; notes?: string }) =>
      apiRequest("PATCH", `/api/scheduling/needs-coverage/${record!.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["needs-coverage"] });
      toast({ title: "Updated", description: "Record updated successfully." });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to update record.", variant: "destructive" }),
  });

  if (!record) return null;

  return (
    <Dialog open={!!record} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Coverage Record</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
            <p className="font-medium">{record.driverName ?? "Unknown Driver"}</p>
            <p className="text-muted-foreground">{record.accountName ?? "Unknown Account"} · {fmtDate(record.shiftDate)}</p>
            <p className="text-muted-foreground">{fmtTime(record.startTime)} – {fmtTime(record.endTime)}</p>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="filled">Filled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {(status === "filled" || status === "in_progress") && (
            <div className="space-y-1">
              <Label>Replacement Driver Name</Label>
              <Input
                placeholder="Name of replacement driver"
                value={replacementName}
                onChange={e => setReplacementName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              placeholder="Add notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({ status, replacementDriverName: replacementName, notes })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function NeedsCoverage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("next_7");
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editRecord, setEditRecord] = useState<NeedsCoverageRecord | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { from, to } = getPresetRange(datePreset);

  const { data, isLoading, isError } = useQuery<NeedsCoverageListResponse>({
    queryKey: ["needs-coverage", datePreset, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/scheduling/needs-coverage?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const records = (data?.records ?? []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.driverName   ?? "").toLowerCase().includes(q) ||
      (r.accountName  ?? "").toLowerCase().includes(q) ||
      (r.reason       ?? "").toLowerCase().includes(q)
    );
  });

  // Quick stats
  const allOpen      = (data?.records ?? []).filter(r => r.status === "open");
  const todayStr     = new Date().toISOString().slice(0, 10);
  const tomorrowStr  = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const openToday    = allOpen.filter(r => r.shiftDate?.slice(0, 10) === todayStr);
  const openTomorrow = allOpen.filter(r => r.shiftDate?.slice(0, 10) === tomorrowStr);
  const filledToday  = (data?.records ?? []).filter(r => r.status === "filled" && r.filledAt?.slice(0, 10) === todayStr);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Needs Coverage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live dispatch work-queue of shifts requiring replacement coverage. Auto-updated from driver reminder responses.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["needs-coverage"] })}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Open (Total)",     value: allOpen.length,       icon: AlertTriangle,  color: "text-amber-600" },
          { label: "Open Today",       value: openToday.length,     icon: CalendarDays,   color: "text-red-600" },
          { label: "Open Tomorrow",    value: openTomorrow.length,  icon: Clock,          color: "text-orange-600" },
          { label: "Filled Today",     value: filledToday.length,   icon: CheckCheck,     color: "text-green-600" },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date presets */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {([
            ["today",     "Today"],
            ["tomorrow",  "Tomorrow"],
            ["this_week", "This Week"],
            ["next_7",    "Next 7 Days"],
            ["all",       "All"],
          ] as [DatePreset, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setDatePreset(val)}
              className={`px-3 py-1.5 transition-colors ${datePreset === val ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="filled">Filled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
          </SelectContent>
        </Select>
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search driver, account…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {records.length > 0 && (
          <span className="text-sm text-muted-foreground ml-auto">{records.length} record{records.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            <XCircle className="h-4 w-4 mr-2" /> Failed to load data
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
            <span>No records match the current filters.</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[110px]">Shift Date</TableHead>
                <TableHead className="w-[120px]">Time</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="w-[60px]">Class</TableHead>
                <TableHead>Reason / Response</TableHead>
                <TableHead className="w-[100px]">Reported By</TableHead>
                <TableHead className="w-[110px]">Date Flagged</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead>Replacement</TableHead>
                <TableHead className="w-[90px]">Source</TableHead>
                <TableHead className="text-right w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => (
                <TableRow
                  key={r.id}
                  className={r.status === "filled" || r.status === "cancelled" ? "opacity-60" : ""}
                >
                  <TableCell className="font-medium text-sm">{fmtDate(r.shiftDate)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {r.startTime && r.endTime
                      ? `${fmtTime(r.startTime)} – ${fmtTime(r.endTime)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.accountName ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.driverId ? (
                        <a
                          href={`/drivers/${r.driverId}`}
                          className="hover:underline text-blue-600"
                          onClick={e => e.stopPropagation()}
                        >
                          {r.driverName ?? "—"}
                        </a>
                      ) : (
                        r.driverName ?? "—"
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ClassBadge cls={r.driverClassification} />
                  </TableCell>
                  <TableCell className="text-sm max-w-[220px]">
                    {r.reason ? (
                      <span className="line-clamp-2 text-muted-foreground">{r.reason}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reportedBy ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDatetime(r.dateFlagged)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.replacementDriverName ? (
                      <span className="text-green-700 font-medium">{r.replacementDriverName}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SourceBadge source={r.sourceType} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status !== "filled" && r.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditRecord(r)}
                        className="h-7 px-2"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialogs */}
      <CreateNeedsCoverageDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <UpdateStatusDialog record={editRecord} onClose={() => setEditRecord(null)} />
    </div>
  );
}
