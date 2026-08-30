/**
 * AMR Innovation Leaderboard Widget
 * Recognizes employee contributions by measuring idea quality and successful
 * implementation. Reuses the /api/tickets/team-activity data payload.
 *
 * Columns: User | Ideas Submitted | Ideas Implemented | Implementation % |
 *           First Pass Acceptance % | Average Completion Time
 *
 * Default sort: Implementation % descending
 * Permissions: admins + Will Walton see all users; standard users see only their own row.
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
  Trophy, ArrowUpDown, ArrowUp, ArrowDown, Download, FileSpreadsheet,
} from "lucide-react";
import type { TeamActivityResponse, TeamActivityRow } from "./AMRTeamActivityWidget";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "today" | "this_week" | "this_month" | "this_year" | "custom" | "all_time";
type SortKey =
  | "name"
  | "ideasSubmitted"
  | "ideasImplemented"
  | "implementationPct"
  | "firstPassPct"
  | "avgCompletionDays";
type SortDir = "asc" | "desc";
interface SortState { key: SortKey; dir: SortDir }

// Derived row type with the computed FPA%
interface LeaderboardRow extends TeamActivityRow {
  firstPassPct: number | null; // null = no acceptance/decline data
}

const DEFAULT_SORT: SortState = { key: "implementationPct", dir: "desc" };

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all_time",   label: "All Time"     },
  { value: "today",      label: "Today"        },
  { value: "this_week",  label: "This Week"    },
  { value: "this_month", label: "This Month"   },
  { value: "this_year",  label: "This Year"    },
  { value: "custom",     label: "Custom Range" },
];

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name",               label: "User"                       },
  { key: "ideasSubmitted",     label: "Ideas Submitted",           align: "right" },
  { key: "ideasImplemented",   label: "Ideas Implemented",         align: "right" },
  { key: "implementationPct",  label: "Implementation %",          align: "right" },
  { key: "firstPassPct",       label: "First Pass Acceptance %",   align: "right" },
  { key: "avgCompletionDays",  label: "Avg Completion Time",       align: "right" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.key !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1 inline" />;
  return sort.dir === "asc"
    ? <ArrowUp   className="h-3 w-3 ml-1 inline text-primary" />
    : <ArrowDown className="h-3 w-3 ml-1 inline text-primary" />;
}

/** First Pass Acceptance % = user_accepts ÷ (user_accepts + user_declines) */
function calcFirstPassPct(row: TeamActivityRow): number | null {
  const total = row.userAccepts + row.returnedForRework;
  if (total === 0) return null;
  return Math.round((row.userAccepts / total) * 100);
}

function pctColor(pct: number | null, thresholdHigh = 80, thresholdMid = 50): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= thresholdHigh) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= thresholdMid)  return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/** Rank badge for top-3 positions */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-amber-500  font-bold text-[10px] w-5 text-center shrink-0">🥇</span>;
  if (rank === 2) return <span className="text-slate-400  font-bold text-[10px] w-5 text-center shrink-0">🥈</span>;
  if (rank === 3) return <span className="text-amber-700  font-bold text-[10px] w-5 text-center shrink-0">🥉</span>;
  return <span className="text-[10px] text-muted-foreground w-5 text-center shrink-0 tabular-nums">{rank}</span>;
}

function exportToCSV(rows: LeaderboardRow[], filename: string) {
  const headers = ["Rank", "User", "Ideas Submitted", "Ideas Implemented",
                   "Implementation %", "First Pass Acceptance %", "Avg Completion Time"];
  const lines = [
    headers.join(","),
    ...rows.map((r, i) =>
      [
        i + 1,
        `"${r.name}"`,
        r.ideasSubmitted,
        r.ideasImplemented,
        `${r.implementationPct}%`,
        r.firstPassPct != null ? `${r.firstPassPct}%` : "",
        r.avgCompletionDays != null ? `${r.avgCompletionDays.toFixed(1)}d` : "",
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function AMRInnovationLeaderboard() {
  const { user }       = useAuth();
  const [, navigate]   = useLocation();

  const [period,   setPeriod]   = useState<Period>("all_time");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [sort,     setSort]     = useState<SortState>(DEFAULT_SORT);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Reuse the team-activity endpoint (identical SQL payload)
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (period !== "all_time") p.set("period", period);
    if (period === "custom") {
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
    }
    return p.toString();
  }, [period, dateFrom, dateTo]);

  const { data, isLoading } = useQuery<TeamActivityResponse>({
    queryKey: [`/api/tickets/team-activity`, queryString],
    queryFn: async () => {
      const url = `/api/tickets/team-activity${queryString ? `?${queryString}` : ""}`;
      const r   = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch team activity");
      return r.json();
    },
  });

  // Derive leaderboard rows with computed FPA%
  const leaderboardRows: LeaderboardRow[] = useMemo(
    () => (data?.rows ?? []).map((r) => ({ ...r, firstPassPct: calcFirstPassPct(r) })),
    [data?.rows]
  );

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted: LeaderboardRow[] = useMemo(() => {
    return [...leaderboardRows].sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      if (typeof av === "string" && typeof bv === "string") {
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av), bn = Number(bv);
      return sort.dir === "asc" ? an - bn : bn - an;
    });
  }, [leaderboardRows, sort]);

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  }

  // ── Drill-down ────────────────────────────────────────────────────────────
  function handleRowClick(row: LeaderboardRow) {
    if (selectedUserId === row.id) {
      setSelectedUserId(null);
    } else {
      setSelectedUserId(row.id);
      navigate(`/tickets?submitter=${encodeURIComponent(row.id)}&excludeCompleted=false`);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExportExcel() {
    exportToExcel(
      sorted.map((r, i) => ({
        rank:              i + 1,
        name:              r.name,
        ideasSubmitted:    r.ideasSubmitted,
        ideasImplemented:  r.ideasImplemented,
        implementationPct: `${r.implementationPct}%`,
        firstPassPct:      r.firstPassPct != null ? `${r.firstPassPct}%` : "",
        avgCompletionDays: r.avgCompletionDays != null ? `${r.avgCompletionDays.toFixed(1)}d` : "",
      })),
      [
        { header: "Rank",                       key: "rank",              width: 8  },
        { header: "User",                       key: "name",              width: 25 },
        { header: "Ideas Submitted",            key: "ideasSubmitted",    width: 18 },
        { header: "Ideas Implemented",          key: "ideasImplemented",  width: 20 },
        { header: "Implementation %",           key: "implementationPct", width: 18 },
        { header: "First Pass Acceptance %",    key: "firstPassPct",      width: 24 },
        { header: "Avg Completion Time",        key: "avgCompletionDays", width: 22 },
      ],
      "amr_innovation_leaderboard"
    );
  }

  function handleExportCSV() {
    exportToCSV(sorted, "amr_innovation_leaderboard");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card data-testid="widget-amr-innovation-leaderboard">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Title */}
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <CardTitle className="text-sm font-semibold">Innovation Leaderboard</CardTitle>
            {!isLoading && leaderboardRows.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {leaderboardRows.length} contributor{leaderboardRows.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-innovation-period">
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

            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleExportExcel}
              data-testid="btn-innovation-export-excel"
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
              data-testid="btn-innovation-export-csv"
              title="Export to CSV"
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>

        {/* Custom date range */}
        {period === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="input-innovation-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="input-innovation-date-to"
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
            No contributions found for the selected period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-innovation-leaderboard">
              <thead>
                <tr className="border-b bg-muted/30">
                  {/* Rank column — not sortable, reflects current sort order */}
                  <th className="px-3 py-1.5 font-medium text-muted-foreground text-center w-8">#</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${col.align === "right" ? "text-right" : "text-left"}`}
                      onClick={() => handleSort(col.key)}
                      data-testid={`th-innovation-${col.key}`}
                    >
                      {col.label}
                      <SortIcon col={col.key} sort={sort} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const rank       = idx + 1;
                  const isSelected = selectedUserId === row.id;
                  const isOwnRow   = user?.id === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`border-b last:border-0 cursor-pointer transition-colors
                        ${isSelected
                          ? "bg-amber-500/10 hover:bg-amber-500/15"
                          : rank <= 3
                            ? "bg-amber-500/[0.03] hover:bg-amber-500/10"
                            : idx % 2 === 0
                              ? "hover:bg-muted/40"
                              : "bg-muted/20 hover:bg-muted/40"
                        }`}
                      onClick={() => handleRowClick(row)}
                      data-testid={`row-innovation-${row.id}`}
                    >
                      {/* Rank */}
                      <td className="px-2 py-1.5 text-center">
                        <RankBadge rank={rank} />
                      </td>

                      {/* User */}
                      <td className="px-3 py-1.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          {row.name || "—"}
                          {isOwnRow && (
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0">you</Badge>
                          )}
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

                      {/* Implementation % */}
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${pctColor(row.implementationPct)}`}>
                        {row.ideasSubmitted > 0 ? `${row.implementationPct}%` : "—"}
                      </td>

                      {/* First Pass Acceptance % */}
                      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${pctColor(row.firstPassPct)}`}>
                        {row.firstPassPct != null ? `${row.firstPassPct}%` : "—"}
                      </td>

                      {/* Avg Completion Time */}
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
