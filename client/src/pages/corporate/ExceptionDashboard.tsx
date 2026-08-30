import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  AlertTriangle, RefreshCw, ShieldAlert, CheckCircle,
  Clock, TrendingDown, ExternalLink, ChevronDown, ChevronUp, Users,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtAge(d: string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

const SEVERITY_CONFIG: Record<string, { label: string; className: string; iconColor: string }> = {
  critical: { label: "Critical", className: "bg-destructive/10 text-destructive border-destructive/30", iconColor: "text-destructive" },
  high:     { label: "High",     className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300/40", iconColor: "text-orange-500" },
  medium:   { label: "Medium",   className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300/40", iconColor: "text-yellow-500" },
  low:      { label: "Low",      className: "bg-muted text-muted-foreground border-muted-foreground/30", iconColor: "text-muted-foreground" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open:        { label: "Open",        variant: "destructive" },
  in_progress: { label: "In Progress", variant: "default" },
  resolved:    { label: "Resolved",    variant: "secondary" },
  ignored:     { label: "Ignored",     variant: "outline" },
};

const CATEGORY_LABELS: Record<string, string> = {
  driver_compliance:  "Driver / Compliance",
  pay_reconciliation: "Pay / Reconciliation",
  cost_allocation:    "Cost / Allocation",
  rideshare:          "Rideshare",
  financial:          "Financial",
};

const MODULE_LABELS: Record<string, string> = {
  openforce:      "OpenForce",
  rideshare:      "Rideshare",
  cost_engine:    "Cost Engine",
  profitability:  "Profitability",
};

const MODULE_LINKS: Record<string, string> = {
  openforce:      "/reports/openforce",
  rideshare:      "/reports/rideshare",
  cost_engine:    "/reports/openforce",
  profitability:  "/reports/account-profitability",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${cfg.className}`}>
      <AlertTriangle className={`h-3 w-3 ${cfg.iconColor}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, iconClass = "", sub }: {
  label: string; value: string | number; icon: any; iconClass?: string; sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        </div>
        <div className={`text-2xl font-bold mt-1 ${iconClass}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Status/Category distribution bar ─────────────────────────────────────────
function DistBar({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex rounded-md overflow-hidden h-2 gap-px">
        {items.map((item, i) => (
          <div
            key={i}
            style={{ width: `${(item.count / total) * 100}%` }}
            className="bg-primary/60"
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {items.map((item, i) => (
          <span key={i} className="text-xs text-muted-foreground">{item.label}: {item.count}</span>
        ))}
      </div>
    </div>
  );
}

// ── Exception Detail Drawer ───────────────────────────────────────────────────
function ExceptionDrawer({ ex, onClose, users }: { ex: any; onClose: () => void; users: any[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [notes, setNotes] = useState(ex.notes ?? "");

  const updateEx = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest("PATCH", `/api/corporate/exceptions/${ex.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/exceptions"] });
      toast({ title: "Exception updated" });
    },
  });

  const handleStatusChange = (newStatus: string) => {
    updateEx.mutate({ status: newStatus });
  };

  const handleAssign = (userId: string) => {
    updateEx.mutate({ assignedToUserId: userId === "__none__" ? "" : userId });
  };

  const handleSaveNotes = () => {
    updateEx.mutate({ notes });
  };

  const sourceLink = MODULE_LINKS[ex.source_module];

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={ex.severity} />
            <span className="text-sm font-medium">{ex.exception_type?.replace(/_/g, " ")}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Info */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="font-medium">{CATEGORY_LABELS[ex.exception_category] ?? ex.exception_category}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="font-medium">{MODULE_LABELS[ex.source_module] ?? ex.source_module}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entity</p>
              <p className="font-medium">{ex.entity_type} — {ex.entity_id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="font-medium">{fmtDate(ex.created_at)}</p>
            </div>
          </section>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm bg-muted rounded-md p-3">{ex.description}</p>
          </div>

          {ex.related_ids && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Related IDs</p>
              <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto">{JSON.stringify(ex.related_ids, null, 2)}</pre>
            </div>
          )}

          <Separator />

          {/* Status Update */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Update Status</p>
            <div className="flex gap-2 flex-wrap">
              {["open", "in_progress", "resolved", "ignored"].map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={ex.status === s ? "default" : "outline"}
                  onClick={() => handleStatusChange(s)}
                  disabled={updateEx.isPending}
                  data-testid={`btn-status-${s}`}
                >
                  {STATUS_CONFIG[s]?.label ?? s}
                </Button>
              ))}
            </div>
            {ex.resolved_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Resolved {fmtDate(ex.resolved_at)}
              </p>
            )}
          </section>

          {/* Assign */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assign To</Label>
            <Select
              value={ex.assigned_to_user_id ?? "__none__"}
              onValueChange={handleAssign}
            >
              <SelectTrigger className="mt-1" data-testid="select-assign-user">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Notes */}
          <section>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add resolution notes or context..."
              data-testid="textarea-notes"
            />
            <Button
              size="sm"
              className="mt-2"
              onClick={handleSaveNotes}
              disabled={updateEx.isPending}
              data-testid="btn-save-notes"
            >
              Save Notes
            </Button>
          </section>

          {/* Navigate to Source */}
          {sourceLink && (
            <>
              <Separator />
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Navigate to Source</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(sourceLink)}
                  data-testid="btn-navigate-source"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in {MODULE_LABELS[ex.source_module] ?? ex.source_module}
                </Button>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function ExceptionDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [filterCategory, setFilterCategory]   = useState("__all__");
  const [filterSeverity, setFilterSeverity]   = useState("__all__");
  const [filterStatus, setFilterStatus]       = useState("__all__");
  const [filterModule, setFilterModule]       = useState("__all__");
  const [filterDateFrom, setFilterDateFrom]   = useState("");
  const [filterDateTo, setFilterDateTo]       = useState("");
  const [sortBy, setSortBy]   = useState("severity_order");
  const [order, setOrder]     = useState("asc");
  const [selectedEx, setSelectedEx] = useState<any | null>(null);

  const params = new URLSearchParams();
  if (filterCategory !== "__all__") params.set("category",     filterCategory);
  if (filterSeverity !== "__all__") params.set("severity",     filterSeverity);
  if (filterStatus   !== "__all__") params.set("status",       filterStatus);
  if (filterModule   !== "__all__") params.set("sourceModule", filterModule);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo)   params.set("dateTo",   filterDateTo);
  params.set("sortBy", sortBy);
  params.set("order", order);
  params.set("limit", "300");

  const { data: summaryData, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/corporate/exceptions/summary"],
    queryFn: () => fetch("/api/corporate/exceptions/summary", { credentials: "include" }).then(r => r.json()),
  });

  const { data: gridData, isLoading: gridLoading } = useQuery<any>({
    queryKey: ["/api/corporate/exceptions", params.toString()],
    queryFn: () => fetch(`/api/corporate/exceptions?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: usersData } = useQuery<any>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users?limit=100", { credentials: "include" }).then(r => r.json()),
  });

  const sync = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/exceptions/sync", { lookbackDays: 90 }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/exceptions"] });
      toast({ title: `Sync complete — ${data?.created ?? 0} exceptions created` });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const kpis    = summaryData?.kpis ?? {};
  const rows    = gridData?.rows    ?? [];
  const total   = gridData?.total   ?? 0;
  const usersList = usersData?.rows ?? usersData?.users ?? [];

  const handleSort = (col: string) => {
    if (sortBy === col) setOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortBy(col); setOrder("asc"); }
  };

  return (
    <div className="p-4 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Exception &amp; Compliance Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centralized risk control — all financial and operational exceptions in one place
          </p>
        </div>
        <Button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          data-testid="btn-sync-exceptions"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "Scanning…" : "Scan All Sources"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <KpiCard
              label="Total Open"
              value={kpis.total_open ?? 0}
              icon={AlertTriangle}
              iconClass={parseInt(kpis.total_open) > 0 ? "text-orange-500" : "text-muted-foreground"}
            />
            <KpiCard
              label="Critical Issues"
              value={kpis.critical ?? 0}
              icon={ShieldAlert}
              iconClass={parseInt(kpis.critical) > 0 ? "text-destructive" : "text-muted-foreground"}
            />
            <KpiCard
              label="High Priority"
              value={kpis.high ?? 0}
              icon={TrendingDown}
              iconClass={parseInt(kpis.high) > 0 ? "text-orange-500" : "text-muted-foreground"}
            />
            <KpiCard
              label="Resolved (7d)"
              value={kpis.resolved_last_7d ?? 0}
              icon={CheckCircle}
              iconClass="text-green-600"
            />
            <KpiCard
              label="Avg Resolution"
              value={kpis.avg_resolution_days ? `${kpis.avg_resolution_days}d` : "—"}
              icon={Clock}
            />
          </>
        )}
      </div>

      {/* Breakdown cards */}
      {!summaryLoading && summaryData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <DistBar
              label="By Severity"
              items={(summaryData.bySeverity ?? []).map((r: any) => ({
                label: SEVERITY_CONFIG[r.severity]?.label ?? r.severity,
                count: r.count,
              }))}
            />
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <DistBar
              label="By Category"
              items={(summaryData.byCategory ?? []).map((r: any) => ({
                label: CATEGORY_LABELS[r.exception_category] ?? r.exception_category,
                count: r.count,
              }))}
            />
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <DistBar
              label="By Source Module"
              items={(summaryData.byModule ?? []).map((r: any) => ({
                label: MODULE_LABELS[r.source_module] ?? r.source_module,
                count: r.count,
              }))}
            />
          </CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-44" data-testid="select-filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  <SelectItem value="driver_compliance">Driver / Compliance</SelectItem>
                  <SelectItem value="pay_reconciliation">Pay / Reconciliation</SelectItem>
                  <SelectItem value="cost_allocation">Cost / Allocation</SelectItem>
                  <SelectItem value="rideshare">Rideshare</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Severity</Label>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="w-36" data-testid="select-filter-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Open (default)</SelectItem>
                  <SelectItem value="open">Open Only</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Source</Label>
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="w-36" data-testid="select-filter-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sources</SelectItem>
                  <SelectItem value="openforce">OpenForce</SelectItem>
                  <SelectItem value="rideshare">Rideshare</SelectItem>
                  <SelectItem value="cost_engine">Cost Engine</SelectItem>
                  <SelectItem value="profitability">Profitability</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="severity_order">Severity (critical first)</SelectItem>
                  <SelectItem value="created_at">Date Created</SelectItem>
                  <SelectItem value="exception_type">Exception Type</SelectItem>
                  <SelectItem value="source_module">Source Module</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-36"
                data-testid="input-date-from"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="w-36"
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Exceptions</CardTitle>
          <span className="text-sm text-muted-foreground">{total} results</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("exception_type")}
                    data-testid="th-exception-type"
                  >
                    <div className="flex items-center gap-1">
                      Exception Type
                      {sortBy === "exception_type" ? (order === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                    </div>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gridLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      No exceptions found. Click &ldquo;Scan All Sources&rdquo; to detect issues.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row: any) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedEx(row)}
                    data-testid={`row-exception-${row.id}`}
                  >
                    <TableCell><SeverityBadge severity={row.severity} /></TableCell>
                    <TableCell className="font-medium text-xs">{row.exception_type?.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[row.exception_category] ?? row.exception_category}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="font-medium capitalize">{row.entity_type}</span>
                        <br />
                        <span className="text-muted-foreground font-mono">{row.entity_id?.slice(0, 12)}{row.entity_id?.length > 12 ? "…" : ""}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs max-w-xs truncate" title={row.description}>{row.description}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{MODULE_LABELS[row.source_module] ?? row.source_module}</Badge>
                    </TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.assigned_to_name ?? <span className="italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtAge(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {selectedEx && (
        <ExceptionDrawer
          ex={selectedEx}
          onClose={() => setSelectedEx(null)}
          users={usersList}
        />
      )}
    </div>
  );
}
