/**
 * Operational Driver Report
 * Per-driver aggregated financials with WIW clocked hours, productivity,
 * utilization, and a drill-down detail sheet.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, parseISO } from "date-fns";
import {
  User, ChevronLeft, ChevronRight, Search, X,
  Activity, Clock, DollarSign, Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? "—" : `${n.toFixed(1)}%`;
};
const fmtHours = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) || n === 0 ? "—" : `${n.toFixed(1)}h`;
};
const fmtDate = (d: string | null | undefined) => d ? format(parseISO(d), "MMM d, yyyy") : "—";

function DriverTypeBadge({ type }: { type: string | null }) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("shift"))  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">DriverShift</Badge>;
  if (t.includes("dash"))   return <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">DriverDash</Badge>;
  return type ? <Badge variant="outline" className="text-xs">{type}</Badge> : null;
}

function UtilizationGauge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">No WIW data</span>;
  const clamp = Math.min(100, Math.max(0, pct));
  const color = clamp >= 70 ? "#22c55e" : clamp >= 40 ? "#f59e0b" : "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" startAngle={90} endAngle={-270} data={[{ value: clamp }]}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" fill={color} background={{ fill: "hsl(var(--muted))" }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{clamp.toFixed(0)}%</span>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function OperationalDriverReport() {
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [dateTo,   setDateTo]   = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [search,   setSearch]   = useState("");
  const [page,     setPage]     = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, search]);

  const listParams = new URLSearchParams({
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo }   : {}),
    ...(search   ? { search }   : {}),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["/api/ops-reporting/drivers/list", dateFrom, dateTo, search, page],
    queryFn:  () => apiRequest("GET", `/api/ops-reporting/drivers/list?${listParams}`).then(r => r.json()),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/ops-reporting/drivers", selected, "detail", dateFrom, dateTo],
    queryFn:  () => apiRequest("GET",
      `/api/ops-reporting/drivers/${selected}/detail?${new URLSearchParams({ ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) })}`
    ).then(r => r.json()),
    enabled: selected != null,
  });

  const rows: any[] = list?.rows ?? [];
  const totalPages  = Math.max(1, Math.ceil((list?.total ?? 0) / PAGE_SIZE));

  const totalMoves    = rows.reduce((s: number, r: any) => s + parseInt(String(r.total_moves ?? 0)), 0);
  const totalRevenue  = rows.reduce((s: number, r: any) => s + parseFloat(String(r.revenue ?? 0)), 0);
  const totalGP       = rows.reduce((s: number, r: any) => s + parseFloat(String(r.gross_profit ?? 0)), 0);
  const totalMoveHrs  = rows.reduce((s: number, r: any) => s + parseFloat(String(r.move_hours ?? 0)), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Productivity, financials, and WIW utilization by driver</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[135px] text-sm" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 w-[135px] text-sm" />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Drivers", value: listLoading ? "…" : String(list?.total ?? 0),                color: "text-foreground"  },
          { label: "Total Moves",    value: listLoading ? "…" : totalMoves.toLocaleString(),             color: "text-blue-700"   },
          { label: "Revenue",        value: listLoading ? "…" : fmt$(totalRevenue),                      color: "text-emerald-700"},
          { label: "Move Hours",     value: listLoading ? "…" : `${totalMoveHrs.toFixed(0)}h`,           color: "text-violet-700" },
        ].map(c => (
          <Card key={c.label} className="p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums truncate ${c.color}`}>{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search drivers…"
          className="pl-8 h-9 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-left">Driver</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-right">Moves</th>
                <th className="px-3 py-2.5 text-right">Revenue</th>
                <th className="px-3 py-2.5 text-right">Driver Pay</th>
                <th className="px-3 py-2.5 text-right">Gross Profit</th>
                <th className="px-3 py-2.5 text-right">Move Hrs</th>
                <th className="px-3 py-2.5 text-right">Clocked Hrs</th>
                <th className="px-3 py-2.5 text-right">Utilization</th>
                <th className="px-3 py-2.5 text-right">Moves/hr</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-3.5 bg-muted/50 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No drivers with moves in this period
                  </td>
                </tr>
              ) : rows.map((row: any) => (
                <tr
                  key={row.driver_id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => setSelected(row.driver_id)}
                >
                  <td className="px-3 py-2.5 font-medium">{row.driver_name}</td>
                  <td className="px-3 py-2.5"><DriverTypeBadge type={row.driver_type} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.total_moves}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt$(row.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(row.driver_pay)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${parseFloat(String(row.gross_profit ?? 0)) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmt$(row.gross_profit)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmtHours(row.move_hours)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {parseFloat(String(row.clocked_hours ?? 0)) > 0 ? fmtHours(row.clocked_hours) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {row.utilization_pct != null
                      ? <span className={parseFloat(String(row.utilization_pct)) >= 70 ? "text-emerald-600" : parseFloat(String(row.utilization_pct)) >= 40 ? "text-amber-600" : "text-muted-foreground"}>
                          {fmtPct(row.utilization_pct)}
                        </span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {row.moves_per_hour != null ? parseFloat(String(row.moves_per_hour)).toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(list?.total ?? 0) > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
            <span className="text-xs text-muted-foreground">
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, list?.total ?? 0).toLocaleString()} of {(list?.total ?? 0).toLocaleString()}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}          onClick={() => setPage(p => p - 1)}><ChevronLeft  className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Utilization legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> ≥70% — High utilization</div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-amber-500"   /> 40–69% — Moderate</div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-slate-400"   /> &lt;40% or no WIW data</div>
      </div>

      {/* Detail sheet */}
      <Sheet open={selected != null} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              {detailLoading ? "Loading…" : (detail?.summary?.driver_name ?? "Driver Detail")}
            </SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
            </div>
          ) : detail && (
            <div className="space-y-5">
              {/* Summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Total Moves",    value: String(detail.summary?.total_moves     ?? 0) },
                  { label: "Completed",      value: String(detail.summary?.completed_moves ?? 0) },
                  { label: "Cancelled",      value: String(detail.summary?.cancelled_moves ?? 0) },
                  { label: "Revenue",        value: fmt$(detail.summary?.revenue)                 },
                  { label: "Driver Pay",     value: fmt$(detail.summary?.driver_pay)              },
                  { label: "Gross Profit",   value: fmt$(detail.summary?.gross_profit)            },
                  { label: "Move Hours",     value: fmtHours(detail.summary?.move_hours)          },
                  { label: "Clocked Hours",  value: fmtHours(detail.summary?.clocked_hours)       },
                  { label: "Utilization",    value: fmtPct(detail.summary?.utilization_pct)       },
                  { label: "Avg Duration",   value: detail.summary?.avg_move_minutes ? `${Math.round(parseFloat(String(detail.summary.avg_move_minutes)))} min` : "—" },
                  { label: "Moves / Hour",   value: detail.summary?.moves_per_hour != null ? `${parseFloat(String(detail.summary.moves_per_hour)).toFixed(2)}` : "—" },
                  { label: "Type",           value: detail.summary?.driver_type ?? "—" },
                ].map(c => (
                  <div key={c.label} className="border rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Top accounts */}
              {(detail.topAccounts ?? []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Top Accounts</h3>
                  <div className="border rounded-lg divide-y overflow-hidden">
                    {(detail.topAccounts as any[]).map((a: any) => (
                      <div key={a.customer_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-medium truncate flex-1">{a.account_name}</span>
                        <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                          <span className="text-muted-foreground">{a.move_count} moves</span>
                          <span className="font-semibold">{fmt$(a.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent moves */}
              {(detail.recentMoves ?? []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Recent Moves</h3>
                  <div className="border rounded-lg divide-y overflow-hidden">
                    {(detail.recentMoves as any[]).map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <span className="font-mono text-xs font-medium">{m.move_number}</span>
                          <span className="text-muted-foreground text-xs ml-2">{fmtDate(m.trip_date)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                          <span className="text-muted-foreground truncate max-w-[100px]">{m.account_name ?? "—"}</span>
                          <span className="font-semibold">{m.revenue != null ? fmt$(m.revenue) : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
