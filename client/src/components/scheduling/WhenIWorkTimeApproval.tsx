/**
 * WhenIWorkTimeApproval  (Ticket 6)
 *
 * Review, approve, or reject raw WIW time-clock records before they are
 * eligible for payroll submission.
 *
 * Workflow:
 *   Import (sync) → Review → Approve → Payroll export (approved only)
 *
 * Key guarantees:
 *  - Only "approved" records surface in the payroll export.
 *  - Every approval/rejection is stamped with reviewer ID + timestamp.
 *  - Bulk and per-row actions both supported.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, Clock, Download, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Filter,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { subDays } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type ApprovalStatus = "unreviewed" | "approved" | "rejected";

interface TimeRecord {
  id: string;
  external_time_id: string;
  clock_in: string | null;
  clock_out: string | null;
  total_minutes: number | null;
  auto_clock_out: boolean;
  notes: string | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  // joined
  driver_name: string | null;
  driver_id: string | null;
  wiw_user_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
}

interface TimeListResponse {
  records: TimeRecord[];
  total: number;
  page: number;
  pageSize: number;
  counts: { unreviewed: number; approved: number; rejected: number; total: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, h:mm a"); }
  catch { return iso; }
}

function fmtMins(mins: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === "approved") return (
    <Badge className="gap-1 bg-green-600 dark:bg-green-700 text-white border-0 text-xs">
      <CheckCircle2 className="h-3 w-3" /> Approved
    </Badge>
  );
  if (status === "rejected") return (
    <Badge className="gap-1 bg-destructive text-destructive-foreground border-0 text-xs">
      <XCircle className="h-3 w-3" /> Rejected
    </Badge>
  );
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Clock className="h-3 w-3" /> Unreviewed
    </Badge>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export function WhenIWorkTimeApproval() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Filters
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("unreviewed");
  const [startDate, setStartDate] = useState(() =>
    subDays(new Date(), 30).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  // ── Query: time records ─────────────────────────────────────────────────────
  const params = new URLSearchParams({
    status: statusFilter,
    start:  startDate,
    end:    endDate,
    page:   String(page),
    pageSize: String(PAGE_SIZE),
  });

  const { data, isLoading, isFetching } = useQuery<TimeListResponse>({
    queryKey: ["/api/scheduling/wheniwork/times", statusFilter, startDate, endDate, page],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/wheniwork/times?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time records");
      return res.json();
    },
  });

  const records = data?.records ?? [];
  const counts  = data?.counts ?? { unreviewed: 0, approved: 0, rejected: 0, total: 0 };
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const allIds = useMemo(() => new Set(records.map((r) => r.id)), [records]);
  const allSelected = allIds.size > 0 && [...allIds].every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) { allIds.forEach((id) => next.delete(id)); }
      else              { allIds.forEach((id) => next.add(id));    }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Mutation: bulk action ───────────────────────────────────────────────────
  const bulkMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const res = await apiRequest("POST", `/api/scheduling/wheniwork/times/${action}`, {
        ids: [...selected],
      });
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (result, action) => {
      setSelected(new Set());
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/times"] });
      toast({
        title: `${result.updated} record${result.updated !== 1 ? "s" : ""} ${action === "approve" ? "approved" : "rejected"}`,
        description: action === "approve"
          ? "These records are now eligible for payroll submission."
          : "These records are excluded from payroll submission.",
      });
    },
    onError: (err: any) => {
      setConfirmAction(null);
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    },
  });

  // ── Single-row action ───────────────────────────────────────────────────────
  const singleMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const res = await apiRequest("POST", `/api/scheduling/wheniwork/times/${action}`, { ids: [id] });
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/times"] });
      toast({
        title: action === "approve" ? "Record approved" : "Record rejected",
        description: action === "approve"
          ? "Eligible for payroll submission."
          : "Excluded from payroll submission.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    },
  });

  // ── Export approved ─────────────────────────────────────────────────────────
  async function exportApproved() {
    const url = `/api/scheduling/wheniwork/times/export?start=${startDate}&end=${endDate}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) { toast({ title: "Export failed", variant: "destructive" }); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wiw_approved_times_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const isBusy = bulkMutation.isPending || singleMutation.isPending;

  return (
    <div className="space-y-4" data-testid="wiw-time-approval">

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Unreviewed", value: counts.unreviewed, color: "text-foreground" },
          { label: "Approved",   value: counts.approved,   color: "text-green-600 dark:text-green-400" },
          { label: "Rejected",   value: counts.rejected,   color: "text-destructive" },
          { label: "Total",      value: counts.total,       color: "text-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-lg bg-muted/50 space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading
              ? <Skeleton className="h-6 w-12" />
              : <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
            }
          </div>
        ))}
      </div>

      {/* Payroll export note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Only <strong>approved</strong> records are included in payroll exports.
          Raw synced time from When I Work is never submitted directly.
        </p>
      </div>

      <Separator />

      {/* Filters toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Status</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); setSelected(new Set()); }}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-approval-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Date range</Label>
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36" data-testid="input-approval-start" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36" data-testid="input-approval-end" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {someSelected && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button size="sm" variant="outline" disabled={isBusy}
                onClick={() => setConfirmAction("approve")}
                data-testid="button-bulk-approve">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={isBusy}
                onClick={() => setConfirmAction("reject")}
                data-testid="button-bulk-reject">
                <XCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                Reject
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={exportApproved}
            data-testid="button-export-approved">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Approved
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="text-xs">Driver</TableHead>
              <TableHead className="text-xs">Clock In</TableHead>
              <TableHead className="text-xs">Clock Out</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Auto Out</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Reviewed By</TableHead>
              <TableHead className="text-xs w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  No time records found for this filter.
                </TableCell>
              </TableRow>
            ) : records.map((rec) => (
              <TableRow key={rec.id} className={selected.has(rec.id) ? "bg-muted/40" : undefined}
                data-testid={`row-time-${rec.id}`}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(rec.id)}
                    onCheckedChange={() => toggleOne(rec.id)}
                    data-testid={`checkbox-${rec.id}`}
                  />
                </TableCell>
                <TableCell className="text-sm font-medium">
                  <div>{rec.driver_name ?? rec.wiw_user_name ?? "Unknown"}</div>
                  {rec.auto_clock_out && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">Linked shift</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {fmtTs(rec.clock_in)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {fmtTs(rec.clock_out)}
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {fmtMins(rec.total_minutes)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rec.auto_clock_out
                    ? <span className="text-amber-600 dark:text-amber-400 text-xs">Auto</span>
                    : <span className="text-muted-foreground text-xs">Manual</span>
                  }
                </TableCell>
                <TableCell>
                  <StatusBadge status={rec.approval_status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {rec.approved_at ? (
                    <span title={`By: ${rec.approved_by ?? "unknown"}`}>
                      {fmtTs(rec.approved_at)}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  {rec.approval_status !== "approved" && (
                    <Button size="sm" variant="ghost"
                      className="h-7 text-xs text-green-600 dark:text-green-400 px-2"
                      disabled={isBusy}
                      onClick={() => singleMutation.mutate({ id: rec.id, action: "approve" })}
                      data-testid={`button-approve-${rec.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                  )}
                  {rec.approval_status !== "rejected" && (
                    <Button size="sm" variant="ghost"
                      className="h-7 text-xs text-destructive px-2"
                      disabled={isBusy}
                      onClick={() => singleMutation.mutate({ id: rec.id, action: "reject" })}
                      data-testid={`button-reject-${rec.id}`}>
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} records
            {isFetching && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
          </p>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk confirm dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" ? "Approve selected records?" : "Reject selected records?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? `This will mark ${selected.size} record${selected.size !== 1 ? "s" : ""} as approved and eligible for payroll submission.`
                : `This will mark ${selected.size} record${selected.size !== 1 ? "s" : ""} as rejected and exclude them from payroll.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && bulkMutation.mutate(confirmAction)}
              className={confirmAction === "reject" ? "bg-destructive text-destructive-foreground" : ""}
              data-testid="button-confirm-action">
              {bulkMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Working…</>
                : confirmAction === "approve" ? "Approve" : "Reject"
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
