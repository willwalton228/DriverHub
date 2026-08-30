import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Users, CreditCard, RotateCcw, PenLine, ListChecks, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────

interface UserActivityRow {
  actorUserId: string;
  actorUserEmail: string | null;
  paymentsCreated: number;
  adjustments: number;
  reversals: number;
  edits: number;
  batchActions: number;
  other: number;
  total: number;
  lastAction: string | null;
}

interface ActivitySummary {
  totalEvents: number;
  uniqueUsers: number;
  paymentsCreated: number;
  reversals: number;
  adjustments: number;
  edits: number;
  batchActions: number;
}

interface UserActivityResponse {
  users: UserActivityRow[];
  summary: ActivitySummary;
}

interface AuditEntry {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorUserEmail: string | null;
  targetEntityType: string;
  targetEntityId: string;
  targetEntityLabel: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
}

interface ActiveUser {
  actorUserId: string | null;
  actorUserEmail: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTION_TYPE_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "financial.payment.created", label: "Payments Created" },
  { value: "financial.payment.reversed", label: "Reversals" },
  { value: "financial.payment.edited", label: "Payment Edits" },
  { value: "financial.payment.reassigned", label: "Reassignments" },
  { value: "financial.invoice.created", label: "Invoices Created" },
  { value: "financial.invoice.updated", label: "Invoice Edits" },
  { value: "financial.invoice.status_changed", label: "Status Changes" },
  { value: "financial.invoice.written_off", label: "Write-offs" },
  { value: "financial.deposit_batch.submit", label: "Batch Submitted" },
  { value: "financial.deposit_batch.lock", label: "Batch Locked" },
  { value: "financial.deposit_batch.reconcile", label: "Batch Reconciled" },
];

type SortField = "total" | "paymentsCreated" | "adjustments" | "reversals" | "edits" | "batchActions" | "lastAction";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTs(ts: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch { return ts; }
}

function eventTypeBadge(eventType: string) {
  const label = eventType.replace("financial.", "");
  if (eventType.includes("payment.created")) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">{label}</Badge>;
  if (eventType.includes("payment.reversed")) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">{label}</Badge>;
  if (eventType.includes("payment")) return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{label}</Badge>;
  if (eventType.includes("deposit_batch")) return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">{label}</Badge>;
  if (eventType.includes("invoice")) return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">{label}</Badge>;
  return <Badge variant="secondary" className="text-xs">{label}</Badge>;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="text-muted-foreground mt-0.5">{icon}</div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-0.5">{typeof value === "number" ? value.toLocaleString() : value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FinancialUserActivityDashboard() {
  // Filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedUser, setSelectedUser] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [fetchKey, setFetchKey] = useState(0);

  // Leaderboard sort
  const [sortField, setSortField] = useState<SortField>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Detail log pagination
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // ── Queries ──────────────────────────────────────────────────────────────

  const baseParams = new URLSearchParams({ fromDate, toDate });
  if (selectedUser !== "all") baseParams.set("actorUserId", selectedUser);

  const { data: activeUsers, isLoading: usersLoading } = useQuery<ActiveUser[]>({
    queryKey: ["/api/corporate/invoicing/financial-audit-log/active-users", fromDate, toDate, fetchKey],
    queryFn: async () => {
      const p = new URLSearchParams({ fromDate, toDate });
      const res = await fetch(`/api/corporate/invoicing/financial-audit-log/active-users?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery<UserActivityResponse>({
    queryKey: ["/api/corporate/invoicing/financial-audit-log/user-activity-summary", fromDate, toDate, selectedUser, fetchKey],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/financial-audit-log/user-activity-summary?${baseParams}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const detailParams = new URLSearchParams({
    fromDate,
    toDate,
    limit: String(pageSize),
    offset: String(page * pageSize),
  });
  if (selectedUser !== "all") detailParams.set("actorUserId", selectedUser);
  if (actionType !== "all") detailParams.set("eventType", actionType);

  const { data: detailData, isLoading: detailLoading, isFetching: detailFetching } = useQuery<AuditLogResponse>({
    queryKey: ["/api/corporate/invoicing/financial-audit-log", fromDate, toDate, selectedUser, actionType, page, fetchKey],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/financial-audit-log?${detailParams}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const totalPages = detailData ? Math.ceil(detailData.total / pageSize) : 0;

  // ── Leaderboard sorting ───────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  const sortedUsers = summaryData?.users ? [...summaryData.users].sort((a, b) => {
    let av: any = a[sortField];
    let bv: any = b[sortField];
    if (sortField === "lastAction") {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  }) : [];

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  }

  function SortTh({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => handleSort(field)}
        data-testid={`sort-${field}`}
      >
        <span className="inline-flex items-center">{children}<SortIcon field={field} /></span>
      </TableHead>
    );
  }

  const refresh = () => {
    setPage(0);
    setFetchKey(k => k + 1);
  };

  const summary = summaryData?.summary;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Financial User Activity
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track and visualize financial actions by user — payments, adjustments, reversals, and edits.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refresh}
          disabled={summaryLoading || detailLoading}
          data-testid="button-refresh-user-activity"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${summaryLoading || detailFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setPage(0); }}
                className="w-40"
                data-testid="input-ua-from-date"
              />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setPage(0); }}
                className="w-40"
                data-testid="input-ua-to-date"
              />
            </div>
            <div className="space-y-1">
              <Label>User</Label>
              <Select value={selectedUser} onValueChange={v => { setSelectedUser(v); setPage(0); }}>
                <SelectTrigger className="w-56" data-testid="select-ua-user">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {(activeUsers || []).map(u => (
                    <SelectItem key={u.actorUserId!} value={u.actorUserId!}>
                      {u.actorUserEmail || u.actorUserId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={v => { setActionType(v); setPage(0); }}>
                <SelectTrigger className="w-52" data-testid="select-ua-action-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={<ListChecks className="w-5 h-5" />} label="Total Events" value={summary?.totalEvents ?? 0} sub="in date range" />
          <StatCard icon={<Users className="w-5 h-5" />} label="Active Users" value={summary?.uniqueUsers ?? 0} sub="with financial actions" />
          <StatCard icon={<CreditCard className="w-5 h-5" />} label="Payments Created" value={summary?.paymentsCreated ?? 0} />
          <StatCard icon={<PenLine className="w-5 h-5" />} label="Adjustments" value={summary?.adjustments ?? 0} sub="edits & reassignments" />
          <StatCard icon={<RotateCcw className="w-5 h-5" />} label="Reversals" value={summary?.reversals ?? 0} />
          <StatCard icon={<PenLine className="w-5 h-5" />} label="Invoice Edits" value={summary?.edits ?? 0} />
        </div>
      )}

      {/* User Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Activity by User
            {summaryData && (
              <span className="text-muted-foreground font-normal">— {summaryData.users.length} user{summaryData.users.length !== 1 ? "s" : ""}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaryLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <SortTh field="paymentsCreated">Payments</SortTh>
                  <SortTh field="adjustments">Adjustments</SortTh>
                  <SortTh field="reversals">Reversals</SortTh>
                  <SortTh field="edits">Invoice Edits</SortTh>
                  <SortTh field="batchActions">Batch Actions</SortTh>
                  <SortTh field="total">Total</SortTh>
                  <SortTh field="lastAction">Last Action</SortTh>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No financial activity found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : sortedUsers.map(u => (
                  <TableRow
                    key={u.actorUserId}
                    className="cursor-pointer"
                    onClick={() => { setSelectedUser(u.actorUserId); setPage(0); }}
                    data-testid={`ua-user-row-${u.actorUserId}`}
                  >
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{u.actorUserEmail || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.actorUserId.slice(0, 12)}…</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.paymentsCreated > 0 ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">{u.paymentsCreated}</Badge>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {u.adjustments > 0 ? (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{u.adjustments}</Badge>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {u.reversals > 0 ? (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">{u.reversals}</Badge>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {u.edits > 0 ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">{u.edits}</Badge>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {u.batchActions > 0 ? (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">{u.batchActions}</Badge>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm">{u.total.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTs(u.lastAction)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed Activity Feed */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            {detailData ? `${detailData.total.toLocaleString()} event(s)` : "Loading…"}
            {selectedUser !== "all" && (
              <Badge variant="secondary" className="text-xs ml-1">
                {activeUsers?.find(u => u.actorUserId === selectedUser)?.actorUserEmail || selectedUser.slice(0, 12)}
                <button
                  className="ml-1 hover:text-foreground"
                  onClick={() => setSelectedUser("all")}
                  data-testid="button-clear-user-filter"
                >×</button>
              </Badge>
            )}
          </CardTitle>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-ua-prev">Prev</Button>
              <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-ua-next">Next</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {detailLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Before → After</TableHead>
                  <TableHead className="w-28">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!detailData?.entries || detailData.entries.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No events found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : detailData.entries.map(entry => (
                  <TableRow key={entry.id} data-testid={`ua-event-row-${entry.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTs(entry.createdAt)}</TableCell>
                    <TableCell>{eventTypeBadge(entry.eventType)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground text-xs">{entry.targetEntityType}</span>
                      <br />
                      <span className="font-medium">{entry.targetEntityLabel || entry.targetEntityId?.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.actorUserEmail || entry.actorUserId || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs">
                      {entry.previousValue || entry.newValue ? (
                        <div className="font-mono space-y-0.5">
                          {entry.previousValue && (
                            <div className="text-muted-foreground line-clamp-1">− {JSON.stringify(entry.previousValue).slice(0, 80)}</div>
                          )}
                          {entry.newValue && (
                            <div className="line-clamp-1">+ {JSON.stringify(entry.newValue).slice(0, 80)}</div>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
