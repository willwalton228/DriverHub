import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Car, TrendingUp, DollarSign, Clock, Filter, ChevronDown, ChevronRight,
  ChevronUp, AlertTriangle, BarChart3, Building2, CalendarDays, Loader2,
  CircleCheck, ArrowUpDown,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChaseOpportunity {
  accountId: string;
  accountNumber: string;
  accountName: string;
  market: string;
  dayCount: number;
  avgDailyRideshareCost: number;
  estimatedDriverCost: number;
  estimatedSavings: number;
  recommendedShift: number;
  recommendedWindow: string;
  confidenceScore: number;
  driverRate: number;
}

interface ChaseOpportunityResponse {
  results: ChaseOpportunity[];
  dateFrom: string;
  dateTo: string;
  driverRate: number;
}

interface DailyBreakdown {
  date: string;
  totalRides: number;
  totalFare: number;
  bestShift: number;
  ridesHandled: number;
  rideshareTotal: number;
  driverCost: number;
  savings: number;
  windowStart: string;
  windowEnd: string;
  rides: Array<{
    id: string;
    startLabel: string;
    endLabel: string;
    provider: string;
    riderName: string;
    fare: number;
    pickup: string;
    dropoff: string;
  }>;
}

interface AccountDetailResponse {
  accountId: string;
  accountName: string;
  accountNumber: string;
  market: string;
  dailyBreakdown: DailyBreakdown[];
  dateFrom: string;
  dateTo: string;
  driverRate: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 70) return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 no-default-active-elevate">{score}%</Badge>;
  if (score >= 40) return <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 no-default-active-elevate">{score}%</Badge>;
  return <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 no-default-active-elevate">{score}%</Badge>;
}

function ShiftBadge({ hours }: { hours: number }) {
  return (
    <Badge variant="outline" className="font-mono text-xs no-default-active-elevate">
      {hours}h
    </Badge>
  );
}

function SavingsBar({ savings, max }: { savings: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (savings / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-20 shrink-0">{fmt$(savings)}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────
function AccountDetailDrawer({
  accountId,
  dateFrom,
  dateTo,
  driverRate,
  open,
  onClose,
}: {
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
  driverRate: string;
  open: boolean;
  onClose: () => void;
}) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<AccountDetailResponse>({
    queryKey: ["/api/corporate/rideshare/chase-opportunity", accountId, dateFrom, dateTo, driverRate],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, driverRate });
      return fetch(`/api/corporate/rideshare/chase-opportunity/${accountId}?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: open && !!accountId,
  });

  const totalSavings = data?.dailyBreakdown.reduce((s, d) => s + d.savings, 0) ?? 0;
  const totalRides = data?.dailyBreakdown.reduce((s, d) => s + d.totalRides, 0) ?? 0;
  const positivedays = data?.dailyBreakdown.filter(d => d.savings > 0).length ?? 0;

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden">
        <div className="border-b px-6 py-4 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            Chase Driver Opportunity
          </SheetTitle>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.accountName}
              {data.accountNumber && <span className="font-mono ml-1.5">#{data.accountNumber}</span>}
              {data.market && <span> · {data.market}</span>}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto">
            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-px bg-border shrink-0">
              {[
                { label: "Total Est. Savings", value: fmt$(totalSavings), color: totalSavings >= 0 ? "text-green-600" : "text-red-600", icon: <TrendingUp className="h-4 w-4" /> },
                { label: "Days Analysed", value: data.dailyBreakdown.length, color: "", icon: <CalendarDays className="h-4 w-4" /> },
                { label: "Days Profitable", value: positivedays, color: "text-green-600", icon: <CircleCheck className="h-4 w-4" /> },
              ].map(kpi => (
                <div key={kpi.label} className="bg-background px-4 py-3">
                  <div className="flex items-center gap-1 text-muted-foreground mb-1">
                    {kpi.icon}
                    <span className="text-xs">{kpi.label}</span>
                  </div>
                  <p className={`text-lg font-semibold ${kpi.color}`} data-testid={`text-chase-kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Daily breakdown */}
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Daily Simulation</p>
              {data.dailyBreakdown.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No days with 2+ rides found in the selected period.
                </div>
              ) : (
                data.dailyBreakdown.map((day) => {
                  const expanded = expandedDays.has(day.date);
                  const positive = day.savings > 0;
                  return (
                    <div key={day.date} className="border rounded-md overflow-hidden">
                      <button
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate"
                        onClick={() => toggleDay(day.date)}
                        data-testid={`button-chase-day-${day.date}`}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <ShiftBadge hours={day.bestShift} />
                              <span className="text-xs text-muted-foreground">{day.windowStart} – {day.windowEnd}</span>
                              <span className={`text-sm font-semibold ${positive ? "text-green-600" : "text-red-500"}`}>
                                {positive ? "+" : ""}{fmt$(day.savings)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{day.totalRides} total rides</span>
                            <span>{day.ridesHandled} replaceable</span>
                            <span>Rideshare: {fmt$(day.rideshareTotal)}</span>
                            <span>Driver: {fmt$(day.driverCost)}</span>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t bg-muted/30">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Time</th>
                                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Provider</th>
                                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Rider</th>
                                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Fare</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {day.rides.map(r => (
                                <tr key={r.id} className="text-xs">
                                  <td className="px-4 py-1.5 whitespace-nowrap">{r.startLabel} – {r.endLabel}</td>
                                  <td className="px-4 py-1.5 capitalize">{r.provider || "—"}</td>
                                  <td className="px-4 py-1.5">{r.riderName || "—"}</td>
                                  <td className="px-4 py-1.5 text-right">{fmt$(r.fare)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No data</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Widget ───────────────────────────────────────────────────────────────
export function ChaseDriverOpportunity() {
  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const days90ago = new Date(); days90ago.setDate(days90ago.getDate() - 90);
  const defaultFrom = days90ago.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom]     = useState(defaultFrom);
  const [dateTo, setDateTo]         = useState(today);
  const [market, setMarket]         = useState("");
  const [accountSearch, setAcct]    = useState("");
  const [minSavings, setMinSavings] = useState("0");
  const [driverRate, setDriverRate] = useState("25");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortDir, setSortDir]       = useState<"desc" | "asc">("desc");

  // Detail drawer
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]           = useState(false);

  const { data, isLoading, isFetching } = useQuery<ChaseOpportunityResponse>({
    queryKey: ["/api/corporate/rideshare/chase-opportunity", dateFrom, dateTo, market, minSavings, driverRate, accountSearch],
    queryFn: () => {
      const p = new URLSearchParams({
        dateFrom, dateTo, driverRate,
        minSavings: minSavings || "0",
      });
      if (market) p.set("market", market);
      return fetch(`/api/corporate/rideshare/chase-opportunity?${p}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 5 * 60 * 1000,
  });

  // Client-side search + sort
  const rows = (data?.results ?? [])
    .filter(r => {
      if (!accountSearch) return true;
      const q = accountSearch.toLowerCase();
      return r.accountName.toLowerCase().includes(q) || r.accountNumber.includes(q);
    })
    .sort((a, b) => sortDir === "desc"
      ? b.estimatedSavings - a.estimatedSavings
      : a.estimatedSavings - b.estimatedSavings
    );

  const maxSavings = rows.length > 0 ? rows[0].estimatedSavings : 1;
  const totalSavings = rows.reduce((s, r) => s + r.estimatedSavings, 0);

  const handleRowClick = (accountId: string) => {
    setDrawerAccountId(accountId);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-3" data-testid="widget-chase-driver-opportunity">
      {/* Header summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-2xl font-semibold text-green-600 dark:text-green-400" data-testid="text-chase-total-savings">{fmt$(totalSavings)}</p>
          <p className="text-xs text-muted-foreground">Total Est. Daily Savings</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold" data-testid="text-chase-account-count">{rows.length}</p>
          <p className="text-xs text-muted-foreground">Accounts</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-primary" data-testid="text-chase-avg-savings">
            {rows.length > 0 ? fmt$(totalSavings / rows.length) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Avg per Account</p>
        </div>
      </div>

      {/* Filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between" data-testid="button-chase-filters">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </div>
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 text-xs" data-testid="input-chase-date-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-7 text-xs" data-testid="input-chase-date-to" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Driver Rate ($/hr)</Label>
              <Input type="number" min="10" max="200" step="0.5" value={driverRate} onChange={e => setDriverRate(e.target.value)} className="h-7 text-xs" data-testid="input-chase-driver-rate" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Savings ($/day)</Label>
              <Input type="number" min="0" step="10" value={minSavings} onChange={e => setMinSavings(e.target.value)} className="h-7 text-xs" data-testid="input-chase-min-savings" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Market / City</Label>
              <Input placeholder="Any" value={market} onChange={e => setMarket(e.target.value)} className="h-7 text-xs" data-testid="input-chase-market" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account</Label>
              <Input placeholder="Search..." value={accountSearch} onChange={e => setAcct(e.target.value)} className="h-7 text-xs" data-testid="input-chase-account" />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground space-y-1">
          <Car className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p>No chase driver opportunities found</p>
          <p className="text-xs">Try adjusting the date range, minimum savings, or driver rate</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Market</TableHead>
                <TableHead className="text-xs text-right">Rideshare / day</TableHead>
                <TableHead className="text-xs text-right hidden md:table-cell">Driver / day</TableHead>
                <TableHead
                  className="text-xs text-right cursor-pointer select-none"
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                  data-testid="th-chase-savings"
                >
                  <div className="flex items-center justify-end gap-1">
                    Savings / day
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Shift</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Window</TableHead>
                <TableHead className="text-xs text-center hidden md:table-cell">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.accountId}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(row.accountId)}
                  data-testid={`row-chase-${row.accountId}`}
                >
                  <TableCell className="py-2">
                    <div className="text-sm font-medium leading-tight">{row.accountName || "—"}</div>
                    {row.accountNumber && (
                      <div className="text-xs text-muted-foreground font-mono">{row.accountNumber}</div>
                    )}
                    <div className="text-xs text-muted-foreground">{row.dayCount} day{row.dayCount !== 1 ? "s" : ""}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{row.market || "—"}</TableCell>
                  <TableCell className="text-right text-sm">{fmt$(row.avgDailyRideshareCost)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground hidden md:table-cell">{fmt$(row.estimatedDriverCost)}</TableCell>
                  <TableCell className="text-right py-2">
                    <SavingsBar savings={row.estimatedSavings} max={maxSavings} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <ShiftBadge hours={row.recommendedShift} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">{row.recommendedWindow}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">
                    <ConfidenceBadge score={row.confidenceScore} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isFetching && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-t text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing...
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      <AccountDetailDrawer
        accountId={drawerAccountId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        driverRate={driverRate}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
