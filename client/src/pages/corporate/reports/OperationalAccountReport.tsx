/**
 * Operational Account Report
 * Per-account aggregated move financials with drill-down detail sheet.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, subDays, parseISO } from "date-fns";
import {
  Building2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Search, X, TrendingUp, DollarSign, Truck, BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return isNaN(n) ? "—" : `${n.toFixed(1)}%`;
};
const fmtDate = (d: string | null | undefined) => d ? format(parseISO(d), "MMM d, yyyy") : "—";

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

const PAGE_SIZE = 50;

export default function OperationalAccountReport() {
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
    queryKey: ["/api/ops-reporting/accounts/list", dateFrom, dateTo, search, page],
    queryFn:  () => apiRequest("GET", `/api/ops-reporting/accounts/list?${listParams}`).then(r => r.json()),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/ops-reporting/accounts", selected, "detail", dateFrom, dateTo],
    queryFn:  () => apiRequest("GET",
      `/api/ops-reporting/accounts/${selected}/detail?${new URLSearchParams({ ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) })}`
    ).then(r => r.json()),
    enabled: selected != null,
  });

  const rows: any[]   = list?.rows ?? [];
  const totalPages    = Math.max(1, Math.ceil((list?.total ?? 0) / PAGE_SIZE));
  const maxRevenue    = Math.max(...rows.map((r: any) => parseFloat(String(r.revenue ?? 0))), 1);

  // Aggregate summary across visible rows (approximation)
  const visibleRevenue    = rows.reduce((s: number, r: any) => s + parseFloat(String(r.revenue    ?? 0)), 0);
  const visibleGP         = rows.reduce((s: number, r: any) => s + parseFloat(String(r.gross_profit ?? 0)), 0);
  const visibleMoves      = rows.reduce((s: number, r: any) => s + parseInt(String(r.total_moves  ?? 0)), 0);
  const visibleGPM        = visibleRevenue > 0 ? ((visibleGP / visibleRevenue) * 100).toFixed(1) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Revenue, cost and profitability by account</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[135px] text-sm" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 w-[135px] text-sm" />
        </div>
      </div>

      {/* Page-level KPIs (from visible rows) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Accounts",     value: listLoading ? "…" : String(list?.total ?? 0),     color: "text-foreground"  },
          { label: "Total Moves",  value: listLoading ? "…" : visibleMoves.toLocaleString(), color: "text-blue-700"   },
          { label: "Revenue",      value: listLoading ? "…" : fmt$(visibleRevenue),           color: "text-emerald-700"},
          { label: "Gross Profit", value: listLoading ? "…" : fmt$(visibleGP),               color: visibleGP >= 0 ? "text-emerald-600" : "text-red-600" },
        ].map(c => (
          <Card key={c.label} className="p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums truncate ${c.color}`}>{c.value}</p>
            {c.label === "Gross Profit" && visibleGPM && (
              <p className="text-xs text-muted-foreground">{visibleGPM}% margin</p>
            )}
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search accounts…"
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
                <th className="px-3 py-2.5 text-left">Account</th>
                <th className="px-3 py-2.5 text-right">Moves</th>
                <th className="px-3 py-2.5 text-left w-24">Share</th>
                <th className="px-3 py-2.5 text-right">Revenue</th>
                <th className="px-3 py-2.5 text-right">Driver Cost</th>
                <th className="px-3 py-2.5 text-right">Gross Profit</th>
                <th className="px-3 py-2.5 text-right">Margin</th>
                <th className="px-3 py-2.5 text-right">Avg Rev/Move</th>
                <th className="px-3 py-2.5 text-right">DR Costs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-3.5 bg-muted/50 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No accounts with moves in this period
                  </td>
                </tr>
              ) : rows.map((row: any) => (
                <tr
                  key={row.customer_id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => setSelected(row.customer_id)}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium truncate max-w-[180px]">{row.account_name}</p>
                    {row.account_number && <p className="text-xs text-muted-foreground">{row.account_number}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.total_moves}</td>
                  <td className="px-3 py-2.5 w-24">
                    <MiniBar value={parseFloat(String(row.revenue ?? 0))} max={maxRevenue} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt$(row.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(row.driver_cost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${parseFloat(String(row.gross_profit ?? 0)) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmt$(row.gross_profit)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmtPct(row.gross_margin_pct)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmt$(row.avg_rev_per_move)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                    {parseFloat(String(row.driver_return_costs ?? 0)) > 0 ? fmt$(row.driver_return_costs) : "—"}
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

      {/* Detail sheet */}
      <Sheet open={selected != null} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              {detailLoading ? "Loading…" : (detail?.summary?.customer_name ?? "Account Detail")}
            </SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
            </div>
          ) : detail && (
            <div className="space-y-5">
              {/* Summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Total Moves",  value: String(detail.summary?.total_moves ?? 0)             },
                  { label: "Completed",    value: String(detail.summary?.completed_moves ?? 0)          },
                  { label: "Cancelled",    value: String(detail.summary?.cancelled_moves ?? 0)          },
                  { label: "Revenue",      value: fmt$(detail.summary?.revenue)                         },
                  { label: "Gross Profit", value: fmt$(detail.summary?.gross_profit)                    },
                  { label: "Margin",       value: fmtPct(detail.summary?.gross_margin_pct)              },
                  { label: "Avg Duration", value: detail.summary?.avg_move_minutes ? `${Math.round(parseFloat(String(detail.summary.avg_move_minutes)))} min` : "—" },
                  { label: "DR Costs",     value: fmt$(detail.summary?.driver_return_costs)             },
                  { label: "DR Count",     value: String(detail.summary?.driver_return_count ?? 0)      },
                ].map(c => (
                  <div key={c.label} className="border rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Top drivers */}
              {(detail.topDrivers ?? []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Top Drivers</h3>
                  <div className="border rounded-lg divide-y overflow-hidden">
                    {(detail.topDrivers as any[]).map((d: any) => (
                      <div key={d.driver_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-medium">{d.driver_name}</span>
                        <div className="flex items-center gap-4 text-xs tabular-nums">
                          <span className="text-muted-foreground">{d.move_count} moves</span>
                          <span className="font-semibold">{fmt$(d.revenue)}</span>
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
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span className="text-muted-foreground">{m.driver_name ?? "—"}</span>
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
