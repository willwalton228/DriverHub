/**
 * AMR Team Activity Widget
 * Displays per-user AMR contribution stats for the Executive Dashboard.
 * Admins + Will Walton see all users; standard users see only their own row.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { exportToExcel } from "@/lib/excelExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Users, ArrowUpDown, ArrowUp, ArrowDown,
  Download, FileSpreadsheet,
} from "lucide-react";
import { useAMRBadges, badgesForUser, BadgeChip } from "./AMRAchievementBadges";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamActivityRow {
  id: string;
  name: string;
  role: string;
  ideasSubmitted: number;
  ideasImplemented: number;
  userAccepts: number;
  returnedForRework: number;
  implementationPct: number;
  avgCompletionDays: number | null;
}

interface TeamActivityResponse {
  rows: TeamActivityRow[];
  canSeeAll: boolean;
}

type Period = "today" | "this_week" | "this_month" | "this_year" | "custom" | "all_time";
type SortKey = keyof Omit<TeamActivityRow, "id" | "role">;
type SortDir = "asc" | "desc";

interface SortState { key: SortKey; dir: SortDir }

const DEFAULT_SORT: SortState = { key: "ideasSubmitted", dir: "desc" };

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all_time",   label: "All Time"     },
  { value: "today",      label: "Today"        },
  { value: "this_week",  label: "This Week"    },
  { value: "this_month", label: "This Month"   },
  { value: "this_year",  label: "This Year"    },
  { value: "custom",     label: "Custom Range" },
];

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name",               label: "User"                  },
  { key: "ideasSubmitted",     label: "Ideas Submitted",     align: "right" },
  { key: "ideasImplemented",   label: "Ideas Implemented",   align: "right" },
  { key: "userAccepts",        label: "User Accepts",        align: "right" },
  { key: "returnedForRework",  label: "Returned for Rework", align: "right" },
  { key: "implementationPct",  label: "Implementation %",    align: "right" },
  { key: "avgCompletionDays",  label: "Avg Days to Complete", align: "right" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1 inline" />;
  return sort.dir === "asc"
    ? <ArrowUp   className="h-3 w-3 ml-1 inline text-primary" />
    : <ArrowDown className="h-3 w-3 ml-1 inline text-primary" />;
}

function implPctColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function exportToCSV(rows: TeamActivityRow[], filename: string) {
  const headers = ["User", "Ideas Submitted", "Ideas Implemented", "User Accepts",
                   "Returned for Rework", "Implementation %", "Avg Days to Complete"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.name}"`,
        r.ideasSubmitted,
        r.ideasImplemented,
        r.userAccepts,
        r.returnedForRework,
        `${r.implementationPct}%`,
        r.avgCompletionDays != null ? r.avgCompletionDays.toFixed(1) : "",
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `${filename}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function AMRTeamActivityWidget() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [period, setPeriod]       = useState<Period>("all_time");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [sort, setSort]           = useState<SortState>(DEFAULT_SORT);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Build query string
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (period !== "all_time") p.set("period", period);
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo", dateTo);
    }
    return p.toString();
  }, [period, dateFrom, dateTo]);

  const { data, isLoading } = useQuery<TeamActivityResponse>({
    queryKey: [`/api/tickets/team-activity`, queryString],
    queryFn: async () => {
      const url = `/api/tickets/team-activity${queryString ? `?${queryString}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch team activity");
      return r.json();
    },
  });

  // Badge annotations — always use all_time so every period of the activity
  // table shows who the current badge holders are.
  const { data: badgesData } = useAMRBadges("all_time");

  const rows = data?.rows ?? [];

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      if (typeof av === "string" && typeof bv === "string") {
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av), bn = Number(bv);
      return sort.dir === "asc" ? an - bn : bn - an;
    });
  }, [rows, sort]);

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  }

  // ── Drill-down: navigate to AMR list filtered by submitter ────────────────
  function handleRowClick(row: TeamActivityRow) {
    if (selectedUserId === row.id) {
      setSelectedUserId(null);
    } else {
      setSelectedUserId(row.id);
      // Navigate to the AMR list filtered to this user's submissions
      navigate(`/tickets?submitter=${encodeURIComponent(row.id)}&excludeCompleted=false`);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExportExcel() {
    exportToExcel(
      sorted.map((r) => ({
        name: r.name,
        ideasSubmitted: r.ideasSubmitted,
        ideasImplemented: r.ideasImplemented,
        userAccepts: r.userAccepts,
        returnedForRework: r.returnedForRework,
        implementationPct: `${r.implementationPct}%`,
        avgCompletionDays: r.avgCompletionDays != null ? r.avgCompletionDays.toFixed(1) : "",
      })),
      [
        { header: "User",                   key: "name",              width: 25 },
        { header: "Ideas Submitted",        key: "ideasSubmitted",    width: 18 },
        { header: "Ideas Implemented",      key: "ideasImplemented",  width: 20 },
        { header: "User Accepts",           key: "userAccepts",       width: 16 },
        { header: "Returned for Rework",    key: "returnedForRework", width: 20 },
        { header: "Implementation %",       key: "implementationPct", width: 18 },
        { header: "Avg Days to Complete",   key: "avgCompletionDays", width: 22 },
      ],
      "amr_team_activity"
    );
  }

  function handleExportCSV() {
    exportToCSV(sorted, "amr_team_activity");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card data-testid="widget-amr-team-activity">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Title + user count */}
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
              <Users className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <CardTitle className="text-sm font-semibold">Team Activity</CardTitle>
            {!isLoading && rows.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {rows.length} user{rows.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-team-activity-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Export buttons */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleExportExcel}
              data-testid="btn-team-activity-export-excel"
              title="Export to Excel"
            >
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleExportCSV}
              data-testid="btn-team-activity-export-csv"
              title="Export to CSV"
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>

        {/* Custom date range row */}
        {period === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
              data-testid="input-team-activity-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
              data-testid="input-team-activity-date-to"
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0 pb-0 pt-0">
        {isLoading ? (
          <div className="px-4 pb-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground px-4 pb-3">
            No activity found for the selected period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-team-activity">
              <thead>
                <tr className="border-b bg-muted/30">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"}`}
                      onClick={() => handleSort(col.key)}
                      data-testid={`th-team-activity-${col.key}`}
                    >
                      {col.label}
                      <SortIcon col={col.key} sort={sort} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const isSelected = selectedUserId === row.id;
                  const isOwnRow   = user?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b last:border-0 cursor-pointer transition-colors
                        ${isSelected
                          ? "bg-violet-500/10 hover:bg-violet-500/15"
                          : idx % 2 === 0
                            ? "hover:bg-muted/40"
                            : "bg-muted/20 hover:bg-muted/40"
                        }`}
                      onClick={() => handleRowClick(row)}
                      data-testid={`row-team-activity-${row.id}`}
                    >
                      {/* User */}
                      <td className="px-3 py-1.5 font-medium">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {row.name || "—"}
                          {isOwnRow && (
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0">you</Badge>
                          )}
                          {badgesForUser(badgesData, row.id).map((bid) => (
                            <BadgeChip key={bid} badgeId={bid} size="xs" />
                          ))}
                        </span>
                      </td>

                      {/* Ideas Submitted */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.ideasSubmitted}
                      </td>

                      {/* Ideas Implemented */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.ideasImplemented}
                      </td>

                      {/* User Accepts */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <span className={row.userAccepts > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                          {row.userAccepts}
                        </span>
                      </td>

                      {/* Returned for Rework */}
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <span className={row.returnedForRework > 0 ? "text-red-600 dark:text-red-400" : ""}>
                          {row.returnedForRework}
                        </span>
                      </td>

                      {/* Implementation % */}
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${implPctColor(row.implementationPct)}`}>
                        {row.ideasSubmitted > 0 ? `${row.implementationPct}%` : "—"}
                      </td>

                      {/* Avg Days to Complete */}
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.avgCompletionDays != null ? `${row.avgCompletionDays.toFixed(1)}d` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
