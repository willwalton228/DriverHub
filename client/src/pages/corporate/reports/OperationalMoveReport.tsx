/**
 * Operational Move Report
 * Enterprise view of imported move data: KPI summary, daily trend chart,
 * and a paginated drill-down table with per-move financials.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, parseISO } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Truck, DollarSign, TrendingUp, XCircle, ChevronLeft, ChevronRight,
  BarChart3, Filter, RefreshCw, ArrowUpDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtK = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "—";
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
};
const fmtPct = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  if (isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
};
const fmtDate = (d: string | null | undefined) => d ? format(parseISO(d), "MMM d, yyyy") : "—";

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Completed</Badge>;
  if (s === "cancelled") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Cancelled</Badge>;
  return <Badge variant="outline" className="text-xs">{status ?? "—"}</Badge>;
}

const PAGE_SIZE = 50;

export default function OperationalMoveReport() {
  // Default: last 90 days
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [dateTo,   setDateTo]   = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [groupBy,  setGroupBy]  = useState<"day" | "week" | "month">("day");
  const [status,   setStatus]   = useState("all");
  const [page,     setPage]     = useState(1);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, status]);

  const params = new URLSearchParams({
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo }   : {}),
  });

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["/api/ops-reporting/moves/summary", dateFrom, dateTo],
    queryFn:  () => apiRequest("GET", `/api/ops-reporting/moves/summary?${params}`).then(r => r.json()),
  });

  const { data: trend = [], isLoading: trendLoading } = useQuery({
    queryKey: ["/api/ops-reporting/moves/trend", dateFrom, dateTo, groupBy],
    queryFn:  () => apiRequest("GET",
      `/api/ops-reporting/moves/trend?${new URLSearchParams({ ...Object.fromEntries(params), groupBy })}`
    ).then(r => r.json()),
  });

  const listParams = new URLSearchParams({
    ...Object.fromEntries(params),
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(status !== "all" ? { status } : {}),
  });
  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["/api/ops-reporting/moves/list", dateFrom, dateTo, status, page],
    queryFn:  () => apiRequest("GET", `/api/ops-reporting/moves/list?${listParams}`).then(r => r.json()),
  });

  const totalPages = Math.max(1, Math.ceil((list?.total ?? 0) / PAGE_SIZE));

  // Format trend data for chart
  const chartData = (trend as any[]).map(r => ({
    period: r.period ? format(new Date(r.period), groupBy === "month" ? "MMM yyyy" : groupBy === "week" ? "MMM d" : "MMM d") : "",
    moves:    parseInt(String(r.moves ?? 0)),
    revenue:  parseFloat(String(r.revenue ?? 0)),
    grossProfit: parseFloat(String(r.gross_profit ?? 0)),
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Move Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Operational move financials from imported data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[135px] text-sm" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 w-[135px] text-sm" />
          <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
            <SelectTrigger className="h-8 w-[90px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total Moves",      value: sumLoading ? "…" : String(summary?.total_moves     ?? 0),   color: "text-foreground"          },
          { label: "Completed",        value: sumLoading ? "…" : String(summary?.completed_moves ?? 0),   color: "text-emerald-600"          },
          { label: "Cancelled",        value: sumLoading ? "…" : String(summary?.cancelled_moves ?? 0),   color: "text-amber-600"            },
          { label: "Revenue",          value: sumLoading ? "…" : fmt$(summary?.revenue),                  color: "text-emerald-700"          },
          { label: "Driver Cost",      value: sumLoading ? "…" : fmt$(summary?.driver_cost),              color: "text-foreground"           },
          { label: "Gross Profit",     value: sumLoading ? "…" : fmt$(summary?.gross_profit),             color: parseFloat(summary?.gross_profit ?? "0") >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: "Gross Margin",     value: sumLoading ? "…" : fmtPct(summary?.gross_margin_pct),       color: "text-blue-700"             },
        ].map(c => (
          <Card key={c.label} className="p-3">
            <p className="text-xs text-muted-foreground truncate">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums truncate ${c.color}`}>{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Avg Move Duration", value: sumLoading ? "…" : summary?.avg_move_minutes ? `${Math.round(parseFloat(String(summary.avg_move_minutes)))} min` : "—" },
          { label: "Avg Revenue / Move", value: sumLoading ? "…" : fmt$(summary?.avg_rev_per_move) },
          { label: "Active Days",        value: sumLoading ? "…" : String(summary?.active_days ?? "—") },
        ].map(c => (
          <Card key={c.label} className="p-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="text-sm font-semibold tabular-nums">{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" />Trend</h2>
        </div>
        {trendLoading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data for selected period</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} tickFormatter={v => fmtK(v)} />
              <Tooltip
                formatter={(val, name) =>
                  name === "moves" ? [val, "Moves"] :
                  name === "revenue" ? [fmt$(val), "Revenue"] :
                  [fmt$(val), "Gross Profit"]
                }
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar    yAxisId="left"  dataKey="moves"       fill="hsl(221, 83%, 53%)" radius={[2, 2, 0, 0]} maxBarSize={24} name="Moves" />
              <Area  yAxisId="right" dataKey="revenue"     fill="transparent" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} name="Revenue" type="monotone" />
              <Area  yAxisId="right" dataKey="grossProfit" fill="transparent" stroke="hsl(262, 80%, 50%)" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Gross Profit" type="monotone" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Drill-down table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b gap-2">
          <h2 className="text-sm font-semibold">Move Detail</h2>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{(list?.total ?? 0).toLocaleString()} rows</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 text-left">Date</th>
                <th className="px-3 py-2.5 text-left">Move #</th>
                <th className="px-3 py-2.5 text-left">Account</th>
                <th className="px-3 py-2.5 text-left">Driver</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">Revenue</th>
                <th className="px-3 py-2.5 text-right">Driver Cost</th>
                <th className="px-3 py-2.5 text-right">Gross Profit</th>
                <th className="px-3 py-2.5 text-right">Margin</th>
                <th className="px-3 py-2.5 text-right">Min</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3.5 bg-muted/50 rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (list?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No moves found for this period
                  </td>
                </tr>
              ) : (list.rows as any[]).map((row: any) => (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(row.trip_date)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.move_number}</td>
                  <td className="px-3 py-2.5 max-w-[140px] truncate" title={row.account_name ?? ""}>{row.account_name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 max-w-[120px] truncate" title={row.driver_name ?? ""}>{row.driver_name  ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.revenue    != null ? fmt$(row.revenue)     : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.driver_cost != null ? fmt$(row.driver_cost) : <span className="text-muted-foreground">—</span>}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${parseFloat(String(row.gross_profit ?? 0)) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.gross_profit != null ? fmt$(row.gross_profit) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{row.gross_margin != null ? fmtPct(row.gross_margin) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{row.move_minutes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(list?.total ?? 0) > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
            <span className="text-muted-foreground text-xs">
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, list?.total ?? 0).toLocaleString()} of {(list?.total ?? 0).toLocaleString()}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}          onClick={() => setPage(p => p - 1)}><ChevronLeft  className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
