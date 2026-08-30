/**
 * At Risk Drivers — Full-Page Drill-Down
 *
 * Displays all active drivers flagged as at risk across three dimensions:
 * Compliance (expired MVR/license), Attendance (poor score / absences),
 * and Performance (poor tier or low score).
 *
 * Supports filtering by risk type, risk level, and account, with
 * sortable columns and pagination. Each row offers View Driver and
 * Create Task (Ops Work Plan) actions.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  ShieldAlert, AlertTriangle, ClipboardX, TrendingDown, ExternalLink,
  ClipboardList, ChevronUp, ChevronDown, ChevronsUpDown, Search,
  RefreshCw, X, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

// ── Types ────────────────────────────────────────────────────────────────────

interface AtRiskDriver {
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  driverNumber: string | null;
  primaryAccountId: string | null;
  primaryAccountName: string | null;
  riskScore: number;
  riskLevel: "High" | "Medium";
  riskTypes: string[];
  triggers: string[];
  lastIncidentDate: string | null;
  perfTier: string | null;
  perfScore: number | null;
  attendanceScore: number | null;
  restrictionLevel: string | null;
}

interface AtRiskResponse {
  total: number;
  totalFiltered: number;
  page: number;
  limit: number;
  totalPages: number;
  complianceCount: number;
  attendanceCount: number;
  performanceCount: number;
  evaluatedAt: string | null;
  drivers: AtRiskDriver[];
}

// ── Sort helper ──────────────────────────────────────────────────────────────

type SortField = "riskScore" | "lastIncident" | "account" | "name";

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: "asc" | "desc" }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 text-primary" />
    : <ChevronUp className="h-3 w-3 text-primary" />;
}

// ── Risk type badge ──────────────────────────────────────────────────────────

function RiskTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Compliance:  "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    Attendance:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    Performance: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${styles[type] ?? "bg-muted text-muted-foreground border-border"}`}>
      {type}
    </span>
  );
}

// ── Risk level badge ─────────────────────────────────────────────────────────

function RiskLevelBadge({ level }: { level: string }) {
  const isHigh = level === "High";
  return (
    <Badge
      variant="outline"
      className={isHigh
        ? "border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40"
        : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40"}
    >
      {level}
    </Badge>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AtRiskDriversPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Parse initial filters from URL
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialRiskType = urlParams.get("riskType") || "";

  // Filter/sort/search state
  const [search, setSearch] = useState("");
  const [riskTypeFilter, setRiskTypeFilter] = useState<string[]>(
    initialRiskType ? [initialRiskType] : []
  );
  const [riskLevelFilter, setRiskLevelFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [sortBy, setSortBy] = useState<SortField>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Creating task state
  const [creatingTaskForId, setCreatingTaskForId] = useState<string | null>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  if (riskTypeFilter.length > 0) queryParams.set("riskType", riskTypeFilter.join(","));
  if (riskLevelFilter !== "all") queryParams.set("riskLevel", riskLevelFilter);
  if (accountFilter !== "all") queryParams.set("accountId", accountFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo)   queryParams.set("dateTo",   dateTo);
  queryParams.set("page", String(page));
  queryParams.set("limit", "50");
  // Server-side sorts: riskScore, lastIncident, account
  const serverSort = sortBy === "riskScore" ? "riskScore"
    : sortBy === "lastIncident" ? "lastIncident"
    : sortBy === "account" ? "account"
    : "riskScore";
  queryParams.set("sortBy", serverSort);

  const queryKey = ["/api/drivers/at-risk", queryParams.toString()];

  const { data, isLoading, isError, refetch } = useQuery<AtRiskResponse>({
    queryKey,
    queryFn: () => fetch(`/api/drivers/at-risk?${queryParams}`).then(r => r.json()),
    staleTime: 60_000,
  });

  // Unique accounts for account filter dropdown
  const accounts: { id: string; name: string }[] = data
    ? Array.from(
        new Map(
          data.drivers
            .filter(d => d.primaryAccountId && d.primaryAccountName)
            .map(d => [d.primaryAccountId!, { id: d.primaryAccountId!, name: d.primaryAccountName! }])
        ).values()
      )
    : [];

  // Client-side search
  const filtered = (data?.drivers ?? []).filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase();
    return name.includes(q)
      || (d.email ?? "").toLowerCase().includes(q)
      || (d.primaryAccountName ?? "").toLowerCase().includes(q)
      || (d.driverNumber ?? "").toLowerCase().includes(q);
  });

  // Client-side sort by name (only used when sortBy = "name")
  const displayed = sortBy === "name"
    ? [...filtered].sort((a, b) => {
        const an = `${a.firstName} ${a.lastName}`.toLowerCase();
        const bn = `${b.firstName} ${b.lastName}`.toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      })
    : filtered;

  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const toggleRiskType = (type: string) => {
    setRiskTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
    setPage(1);
  };

  const createTaskMutation = useMutation({
    mutationFn: async (driver: AtRiskDriver) => {
      const name = [driver.firstName, driver.lastName].filter(Boolean).join(" ") || driver.email || driver.driverId;
      const riskLabel = driver.riskTypes.join(", ") || "Risk";
      return apiRequest("POST", "/api/work-plan-items/ensure-batch", {
        items: [{
          eventType:    `at_risk_driver`,
          recordId:     driver.driverId,
          recordName:   name,
          reason:       `At Risk: ${riskLabel} — ${driver.triggers.join("; ")}`,
          priority:     driver.riskLevel === "High" ? "high" : "normal",
          recordUrl:    `/drivers/${driver.driverId}`,
          taskType:     "Driver Risk",
          sourceModule: "compliance",
          category:     "driver_ops",
        }],
      });
    },
    onSuccess: (_, driver) => {
      toast({ title: "Task added to Driver Ops Work Plan" });
      setCreatingTaskForId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
      setCreatingTaskForId(null);
    },
  });

  const handleCreateTask = (driver: AtRiskDriver) => {
    setCreatingTaskForId(driver.driverId);
    createTaskMutation.mutate(driver);
  };

  const totalFiltered = data?.totalFiltered ?? 0;
  const totalPages    = data?.totalPages ?? 1;

  const locationSearch = useSearch();
  const fromClaimsDashboard = new URLSearchParams(locationSearch).get("from") === "claims-dashboard";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back to Claims Dashboard banner */}
      {fromClaimsDashboard && (
        <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center">
          <Link href="/claims/dashboard">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Claims Dashboard
            </Button>
          </Link>
        </div>
      )}
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">At Risk Drivers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drivers flagged for attendance, compliance, or performance issues
            </p>
          </div>
        </div>

        {/* Summary chips */}
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setRiskTypeFilter([]); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${riskTypeFilter.length === 0 ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid="filter-all"
            >
              All <span className="font-bold">{data.total}</span>
            </button>
            <button
              onClick={() => toggleRiskType("attendance")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${riskTypeFilter.includes("attendance") ? "bg-amber-100 dark:bg-amber-900/60 border-amber-400 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid="filter-attendance"
            >
              <AlertTriangle className="h-3 w-3" />
              Attendance <span className="font-bold">{data.attendanceCount}</span>
            </button>
            <button
              onClick={() => toggleRiskType("compliance")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${riskTypeFilter.includes("compliance") ? "bg-red-100 dark:bg-red-900/60 border-red-400 text-red-700 dark:text-red-300" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid="filter-compliance"
            >
              <ClipboardX className="h-3 w-3" />
              Compliance <span className="font-bold">{data.complianceCount}</span>
            </button>
            <button
              onClick={() => toggleRiskType("performance")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${riskTypeFilter.includes("performance") ? "bg-orange-100 dark:bg-orange-900/60 border-orange-400 text-orange-700 dark:text-orange-300" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid="filter-performance"
            >
              <TrendingDown className="h-3 w-3" />
              Performance <span className="font-bold">{data.performanceCount}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-muted/20">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search drivers..."
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>

        {/* Risk Level */}
        <Select value={riskLevelFilter} onValueChange={v => { setRiskLevelFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36" data-testid="select-risk-level">
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
          </SelectContent>
        </Select>

        {/* Account */}
        <Select value={accountFilter} onValueChange={v => { setAccountFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44" data-testid="select-account">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={v => { setSortBy(v as SortField); setPage(1); }}>
          <SelectTrigger className="h-9 w-44" data-testid="select-sort">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="riskScore">Highest Risk Score</SelectItem>
            <SelectItem value="lastIncident">Most Recent Incident</SelectItem>
            <SelectItem value="account">Account (A–Z)</SelectItem>
            <SelectItem value="name">Driver Name (A–Z)</SelectItem>
          </SelectContent>
        </Select>

        {/* Date From */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 w-36 text-sm"
            data-testid="input-date-from"
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 w-36 text-sm"
            data-testid="input-date-to"
          />
        </div>

        {/* Clear filters */}
        {(riskTypeFilter.length > 0 || riskLevelFilter !== "all" || accountFilter !== "all" || search || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRiskTypeFilter([]);
              setRiskLevelFilter("all");
              setAccountFilter("all");
              setDateFrom("");
              setDateTo("");
              setSearch("");
              setPage(1);
            }}
            data-testid="button-clear-filters"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        {/* Results count */}
        {!isLoading && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {totalFiltered} driver{totalFiltered !== 1 ? "s" : ""}
            {displayed.length !== totalFiltered && ` (${displayed.length} shown)`}
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              {/* Driver Name */}
              <TableHead className="pl-6 min-w-[180px]">
                <button
                  className="flex items-center gap-1 font-medium"
                  onClick={() => handleSort("name")}
                  data-testid="sort-name"
                >
                  Driver
                  <SortIcon field="name" current={sortBy} dir={sortDir} />
                </button>
              </TableHead>
              {/* Risk Score */}
              <TableHead className="w-28">
                <button
                  className="flex items-center gap-1 font-medium"
                  onClick={() => handleSort("riskScore")}
                  data-testid="sort-risk-score"
                >
                  Risk Score
                  <SortIcon field="riskScore" current={sortBy} dir={sortDir} />
                </button>
              </TableHead>
              {/* Risk Level */}
              <TableHead className="w-28">Level</TableHead>
              {/* Risk Types */}
              <TableHead className="min-w-[160px]">Risk Type(s)</TableHead>
              {/* Primary Account */}
              <TableHead className="min-w-[150px]">
                <button
                  className="flex items-center gap-1 font-medium"
                  onClick={() => handleSort("account")}
                  data-testid="sort-account"
                >
                  Account
                  <SortIcon field="account" current={sortBy} dir={sortDir} />
                </button>
              </TableHead>
              {/* Last Incident */}
              <TableHead className="w-36">
                <button
                  className="flex items-center gap-1 font-medium"
                  onClick={() => handleSort("lastIncident")}
                  data-testid="sort-last-incident"
                >
                  Last Incident
                  <SortIcon field="lastIncident" current={sortBy} dir={sortDir} />
                </button>
              </TableHead>
              {/* Key Triggers */}
              <TableHead className="min-w-[200px]">Key Trigger(s)</TableHead>
              {/* Status */}
              <TableHead className="w-24">Status</TableHead>
              {/* Actions */}
              <TableHead className="w-24 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  Failed to load at-risk drivers. Please try again.
                </TableCell>
              </TableRow>
            ) : displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">No drivers currently flagged as at risk</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {search || riskTypeFilter.length > 0 || riskLevelFilter !== "all" || accountFilter !== "all" || dateFrom || dateTo
                          ? "Try adjusting your filters."
                          : data?.evaluatedAt
                            ? `Last evaluated ${format(new Date(data.evaluatedAt), "MMM d, yyyy 'at' h:mm a")}`
                            : "Risk scores are evaluated nightly."}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              displayed.map(driver => {
                const name = [driver.firstName, driver.lastName].filter(Boolean).join(" ") || driver.email || "—";
                const isCreating = creatingTaskForId === driver.driverId;
                return (
                  <TableRow
                    key={driver.driverId}
                    className="hover:bg-muted/40 transition-colors"
                    data-testid={`row-driver-${driver.driverId}`}
                  >
                    {/* Driver Name */}
                    <TableCell className="pl-6 font-medium">
                      <button
                        onClick={() => navigate(`/drivers/${driver.driverId}`)}
                        className="text-sm font-medium hover:text-primary hover:underline text-left"
                        data-testid={`link-driver-${driver.driverId}`}
                      >
                        {name}
                      </button>
                      {driver.driverNumber && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">#{driver.driverNumber}</p>
                      )}
                    </TableCell>

                    {/* Risk Score */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: driver.riskScore >= 75
                              ? "rgb(220 38 38)"
                              : driver.riskScore >= 50
                                ? "rgb(245 158 11)"
                                : "rgb(249 115 22)"
                          }}
                        />
                        <span className="text-sm font-mono font-medium" data-testid={`risk-score-${driver.driverId}`}>
                          {driver.riskScore}
                        </span>
                      </div>
                    </TableCell>

                    {/* Risk Level */}
                    <TableCell>
                      <RiskLevelBadge level={driver.riskLevel} />
                    </TableCell>

                    {/* Risk Types */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {driver.riskTypes.map(t => (
                          <RiskTypeBadge key={t} type={t} />
                        ))}
                      </div>
                    </TableCell>

                    {/* Primary Account */}
                    <TableCell className="text-sm">
                      {driver.primaryAccountName ? (
                        <button
                          onClick={() => driver.primaryAccountId && navigate(`/accounts/${driver.primaryAccountId}`)}
                          className="hover:text-primary hover:underline text-left"
                          data-testid={`link-account-${driver.driverId}`}
                        >
                          {driver.primaryAccountName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Last Incident Date */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {driver.lastIncidentDate
                        ? format(new Date(driver.lastIncidentDate), "MMM d, yyyy")
                        : "—"}
                    </TableCell>

                    {/* Key Triggers */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {driver.triggers.slice(0, 3).map((t, i) => (
                          <span key={i} className="text-xs text-muted-foreground leading-snug">
                            {t}
                          </span>
                        ))}
                        {driver.triggers.length > 3 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            +{driver.triggers.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <StatusBadge status={driver.status} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => navigate(`/drivers/${driver.driverId}`)}
                              data-testid={`button-view-driver-${driver.driverId}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">View Driver</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-primary"
                              disabled={isCreating}
                              onClick={() => handleCreateTask(driver)}
                              data-testid={`button-create-task-${driver.driverId}`}
                            >
                              {isCreating
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <ClipboardList className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Create Ops Task</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-border bg-background">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {totalFiltered} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
