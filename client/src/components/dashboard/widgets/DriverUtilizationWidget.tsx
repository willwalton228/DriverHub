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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TrendingUp, Users, Clock, DollarSign, Filter, ChevronDown,
  ChevronRight, ChevronUp, Loader2, AlertCircle, CheckCircle2,
  Car, ArrowUpDown, Calendar, ClipboardList, Activity,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Recommendation = "use_existing_drivers" | "add_chase_driver" | "rideshare_appropriate";

interface UtilizationAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  market: string;
  driverCount: number;
  hasShiftData: boolean;
  totalDriverHours: number;
  idleHours: number;
  idlePercent: number;
  rideshareSpend: number;
  recoverableSpend: number;
  recommendation: Recommendation;
}

interface UtilizationResponse {
  results: UtilizationAccount[];
  dateFrom: string;
  dateTo: string;
  bufferMinutes: number;
}

interface AccountDetailResponse {
  accountId: string;
  accountName: string;
  accountNumber: string;
  market: string;
  summary: {
    totalDriverHours: number;
    totalIdleHours: number;
    idlePercent: number;
    rideshareSpend: number;
    recoverableSpend: number;
  };
  byDriver: Array<{
    driverId: string;
    driverName: string;
    days: Array<{
      date: string;
      shiftHrs: number;
      idleHrs: number;
      moveCount: number;
      moves: Array<{ from: string; to: string; moveNumber: string; startLabel: string; endLabel: string }>;
      idleWindows: Array<{ startLabel: string; endLabel: string; durationMins: number }>;
    }>;
  }>;
  rides: Array<{
    date: string;
    provider: string;
    riderName: string;
    fare: number;
    isRecoverable: boolean;
    rideStartLabel: string;
    rideEndLabel: string;
  }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(v: number | null | undefined): string {
  const n = v ?? 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  switch (rec) {
    case "use_existing_drivers":
      return (
        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 whitespace-nowrap text-xs no-default-active-elevate">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Use Existing Drivers
        </Badge>
      );
    case "add_chase_driver":
      return (
        <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 whitespace-nowrap text-xs no-default-active-elevate">
          <Car className="h-3 w-3 mr-1" />
          Add Chase Driver
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="whitespace-nowrap text-xs text-muted-foreground no-default-active-elevate">
          Rideshare Appropriate
        </Badge>
      );
  }
}

function IdleBar({ percent }: { percent: number }) {
  const capped = Math.min(100, Math.max(0, percent));
  const color = capped > 60 ? "bg-red-400" : capped > 30 ? "bg-yellow-400" : "bg-green-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs tabular-nums w-10 text-right">{capped.toFixed(1)}%</span>
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${capped}%` }} />
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────
function AccountDetailDrawer({
  accountId, dateFrom, dateTo, bufferMinutes, open, onClose,
}: {
  accountId: string | null; dateFrom: string; dateTo: string;
  bufferMinutes: string; open: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<"drivers" | "rides">("drivers");
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<AccountDetailResponse>({
    queryKey: ["/api/corporate/rideshare/utilization", accountId, dateFrom, dateTo, bufferMinutes],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, bufferMinutes });
      return fetch(`/api/corporate/rideshare/utilization/${accountId}?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: open && !!accountId,
  });

  const toggleDriver = (driverId: string) => {
    setExpandedDrivers(prev => {
      const next = new Set(prev);
      next.has(driverId) ? next.delete(driverId) : next.add(driverId);
      return next;
    });
  };

  const s = data?.summary;
  const recoverableRides = data?.rides.filter(r => r.isRecoverable) ?? [];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden">
        <div className="border-b px-6 py-4 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Driver Utilization Report
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
            <div className="grid grid-cols-4 gap-px bg-border shrink-0">
              {[
                { label: "Driver Hours", value: `${s?.totalDriverHours ?? 0}h`, icon: <Users className="h-3.5 w-3.5" /> },
                { label: "Idle Hours", value: `${s?.totalIdleHours ?? 0}h`, icon: <Clock className="h-3.5 w-3.5" />, color: (s?.totalIdleHours ?? 0) > 5 ? "text-yellow-600" : "" },
                { label: "Rideshare Spend", value: fmt$(s?.rideshareSpend), icon: <DollarSign className="h-3.5 w-3.5" /> },
                { label: "Recoverable", value: fmt$(s?.recoverableSpend), icon: <TrendingUp className="h-3.5 w-3.5" />, color: (s?.recoverableSpend ?? 0) > 0 ? "text-green-600" : "" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-background px-3 py-2.5">
                  <div className="flex items-center gap-1 text-muted-foreground mb-1">
                    {kpi.icon}
                    <span className="text-xs">{kpi.label}</span>
                  </div>
                  <p className={`text-base font-semibold ${kpi.color ?? ""}`} data-testid={`text-util-kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div className="flex border-b px-4">
              {(["drivers", "rides"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                    tab === t ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground"
                  }`}
                  data-testid={`tab-util-${t}`}
                >
                  {t === "drivers" ? `Drivers (${data.byDriver.length})` : `Rideshare Rides (${data.rides.length})`}
                </button>
              ))}
            </div>

            {/* Drivers tab */}
            {tab === "drivers" && (
              <div className="px-4 py-3 space-y-2">
                {data.byDriver.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No driver data found for this account in the selected period.
                  </div>
                ) : data.byDriver.map(driver => {
                  const expanded = expandedDrivers.has(driver.driverId);
                  const totalDriverHrs = driver.days.reduce((s, d) => s + d.shiftHrs, 0);
                  const totalIdleHrs   = driver.days.reduce((s, d) => s + d.idleHrs, 0);
                  return (
                    <div key={driver.driverId} className="border rounded-md overflow-hidden">
                      <button
                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate"
                        onClick={() => toggleDriver(driver.driverId)}
                        data-testid={`button-util-driver-${driver.driverId}`}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium">{driver.driverName}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{driver.days.length} day{driver.days.length !== 1 ? "s" : ""}</span>
                              <span>{totalDriverHrs.toFixed(1)}h scheduled</span>
                              <span className={totalIdleHrs > 2 ? "text-yellow-600 font-medium" : ""}>{totalIdleHrs.toFixed(1)}h idle</span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t divide-y">
                          {driver.days.map(day => (
                            <div key={day.date} className="px-4 py-2.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium">
                                  {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                </span>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span><span className="font-medium">{day.moveCount}</span> moves</span>
                                  <span><span className="font-medium">{day.shiftHrs}h</span> shift</span>
                                  <span className={day.idleHrs > 1 ? "text-yellow-600 font-medium" : ""}>{day.idleHrs}h idle</span>
                                </div>
                              </div>

                              {day.moves.length > 0 && (
                                <div className="space-y-0.5 mb-1.5">
                                  {day.moves.map((m, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <ClipboardList className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span className="font-mono text-muted-foreground">{m.startLabel} – {m.endLabel}</span>
                                      <span className="truncate text-foreground">{m.from} → {m.to}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {day.idleWindows.length > 0 && (
                                <div className="space-y-0.5">
                                  {day.idleWindows.map((w, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                                      <Clock className="h-3 w-3 shrink-0" />
                                      <span className="font-mono">{w.startLabel} – {w.endLabel}</span>
                                      <span className="text-muted-foreground">({w.durationMins} min idle)</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rides tab */}
            {tab === "rides" && (
              <div className="px-4 py-3">
                {data.rides.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No rideshare rides found for this account in the selected period.
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date / Time</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Provider</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rider</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Fare</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground">Recoverable?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.rides.map((r, i) => (
                          <tr key={i} className={r.isRecoverable ? "bg-green-50/50 dark:bg-green-950/20" : ""}>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <div>{r.date}</div>
                              <div className="text-muted-foreground">{r.rideStartLabel}{r.rideEndLabel ? ` – ${r.rideEndLabel}` : ""}</div>
                            </td>
                            <td className="px-3 py-1.5 capitalize">{r.provider || "—"}</td>
                            <td className="px-3 py-1.5">{r.riderName || "—"}</td>
                            <td className="px-3 py-1.5 text-right">{fmt$(r.fare)}</td>
                            <td className="px-3 py-1.5 text-center">
                              {r.isRecoverable
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                : <span className="text-muted-foreground">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {recoverableRides.length > 0 && (
                  <div className="mt-3 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-400">
                    <strong>{recoverableRides.length}</strong> ride{recoverableRides.length !== 1 ? "s" : ""} ({fmt$(recoverableRides.reduce((s, r) => s + r.fare, 0))}) could have been covered by an idle driver.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No data</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Widget ───────────────────────────────────────────────────────────────
export function DriverUtilizationWidget() {
  const today    = new Date().toISOString().slice(0, 10);
  const days90   = new Date(); days90.setDate(days90.getDate() - 90);
  const defFrom  = days90.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom]       = useState(defFrom);
  const [dateTo, setDateTo]           = useState(today);
  const [market, setMarket]           = useState("");
  const [accountSearch, setAcctSrch]  = useState("");
  const [bufferMinutes, setBuffer]    = useState("10");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortField, setSortField]     = useState<"recoverable" | "rideshare" | "idle">("recoverable");

  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]           = useState(false);

  const { data, isLoading, isFetching } = useQuery<UtilizationResponse>({
    queryKey: ["/api/corporate/rideshare/utilization", dateFrom, dateTo, market, bufferMinutes],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, bufferMinutes });
      if (market) p.set("market", market);
      return fetch(`/api/corporate/rideshare/utilization?${p}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = (data?.results ?? [])
    .filter(r => {
      if (!accountSearch) return true;
      const q = accountSearch.toLowerCase();
      return r.accountName.toLowerCase().includes(q) || r.accountNumber.includes(q);
    })
    .sort((a, b) => {
      if (sortField === "recoverable") return b.recoverableSpend - a.recoverableSpend;
      if (sortField === "rideshare")   return b.rideshareSpend   - a.rideshareSpend;
      return b.idlePercent - a.idlePercent;
    });

  const totalRecoverable = rows.reduce((s, r) => s + r.recoverableSpend, 0);
  const totalRideshare   = rows.reduce((s, r) => s + r.rideshareSpend, 0);
  const accountsWithOpp  = rows.filter(r => r.recommendation === "use_existing_drivers").length;

  const handleRowClick = (accountId: string) => {
    setDrawerAccountId(accountId);
    setDrawerOpen(true);
  };

  const SortTh = ({ field, label }: { field: typeof sortField; label: string }) => (
    <TableHead
      className="text-xs text-right cursor-pointer select-none"
      onClick={() => setSortField(field)}
      data-testid={`th-util-${field}`}
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-foreground" : "text-muted-foreground"}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-3" data-testid="widget-driver-utilization">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-2xl font-semibold text-green-600 dark:text-green-400" data-testid="text-util-total-recoverable">{fmt$(totalRecoverable)}</p>
          <p className="text-xs text-muted-foreground">Total Recoverable</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold" data-testid="text-util-total-rideshare">{fmt$(totalRideshare)}</p>
          <p className="text-xs text-muted-foreground">Rideshare Spend</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-primary" data-testid="text-util-accounts-with-opp">{accountsWithOpp}</p>
          <p className="text-xs text-muted-foreground">Accounts w/ Opp</p>
        </div>
      </div>

      {/* Filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between" data-testid="button-util-filters">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(market || accountSearch) && <Badge variant="secondary" className="ml-1 text-xs no-default-active-elevate">Active</Badge>}
            </div>
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 text-xs" data-testid="input-util-date-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-7 text-xs" data-testid="input-util-date-to" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Market / City</Label>
              <Input placeholder="Any" value={market} onChange={e => setMarket(e.target.value)} className="h-7 text-xs" data-testid="input-util-market" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account</Label>
              <Input placeholder="Search..." value={accountSearch} onChange={e => setAcctSrch(e.target.value)} className="h-7 text-xs" data-testid="input-util-account" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Move Buffer (min)</Label>
              <Input type="number" min="0" max="60" step="5" value={bufferMinutes} onChange={e => setBuffer(e.target.value)} className="h-7 text-xs" data-testid="input-util-buffer" />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground space-y-1">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p>No utilization data found</p>
          <p className="text-xs">Requires matched rideshare data and driver trip records in the date range</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Account</TableHead>
                <TableHead className="text-xs text-right hidden sm:table-cell">Driver Hrs</TableHead>
                <SortTh field="idle" label="Idle %" />
                <SortTh field="rideshare" label="RS Spend" />
                <SortTh field="recoverable" label="Recoverable" />
                <TableHead className="text-xs hidden md:table-cell">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow
                  key={row.accountId}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(row.accountId)}
                  data-testid={`row-util-${row.accountId}`}
                >
                  <TableCell className="py-2">
                    <div className="text-sm font-medium">{row.accountName || "—"}</div>
                    {row.accountNumber && <div className="text-xs text-muted-foreground font-mono">{row.accountNumber}</div>}
                    {!row.hasShiftData && row.driverCount > 0 && (
                      <div className="text-xs text-muted-foreground/60 italic">est. from trips</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    {row.totalDriverHours > 0 ? `${row.totalDriverHours}h` : "—"}
                  </TableCell>
                  <TableCell className="py-2">
                    {row.totalDriverHours > 0
                      ? <IdleBar percent={row.idlePercent} />
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </TableCell>
                  <TableCell className="text-right text-sm">{fmt$(row.rideshareSpend)}</TableCell>
                  <TableCell className="text-right text-sm font-medium text-green-600 dark:text-green-400">
                    {row.recoverableSpend > 0 ? fmt$(row.recoverableSpend) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell py-2">
                    <RecommendationBadge rec={row.recommendation} />
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

      {/* Legend */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Use existing drivers</div>
          <div className="flex items-center gap-1"><Car className="h-3 w-3 text-blue-500" /> Add chase driver</div>
          <div className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-muted-foreground/50" /> Rideshare appropriate</div>
        </div>
      )}

      <AccountDetailDrawer
        accountId={drawerAccountId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        bufferMinutes={bufferMinutes}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
