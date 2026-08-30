import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ComposedChart, Line, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { rechartsTooltipStyle } from "@/lib/chartUtils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft, TrendingUp, Clock, DollarSign, Activity, Car,
  Users, ChevronRight, CheckCircle2, AlertCircle, BarChart3,
  Sun, Loader2, ClipboardList, Calendar, Filter,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────
type Recommendation = "use_existing_drivers" | "add_chase_driver" | "rideshare_appropriate";

interface UtilRow {
  accountId: string; accountNumber: string; accountName: string; market: string;
  driverCount: number; hasShiftData: boolean;
  totalDriverHours: number; idleHours: number; idlePercent: number;
  rideshareSpend: number; recoverableSpend: number;
  recommendation: Recommendation;
}
interface ChaseRow {
  accountId: string; accountNumber: string; accountName: string; market: string;
  dayCount: number; avgDailyRideshareCost: number; estimatedDriverCost: number;
  estimatedSavings: number; recommendedShift: number; recommendedWindow: string;
  confidenceScore: number;
}
interface HourlyData {
  hour: number; label: string;
  rideshareCount: number; rideshareSpend: number;
  driverMoveCount: number; driverBusyMinutes: number;
  estimatedIdleMinutes: number; hasOverlap: boolean;
}
interface SimulationRow {
  shiftHours: number; timeWindowLabel: string; windowStart: string; windowEnd: string;
  driverCostPerDay: number; avgReplaceableRides: number;
  avgRideshareReplaced: number; avgSavingsPerDay: number;
  weeklyProjection: number; isPositive: boolean;
}
interface DriverDay {
  date: string; shiftHrs: number; idleHrs: number; moveCount: number;
  moves: Array<{ from: string; to: string; moveNumber: string; startLabel: string; endLabel: string }>;
  idleWindows: Array<{ startLabel: string; endLabel: string; durationMins: number }>;
}
interface DriverDetail { driverId: string; driverName: string; days: DriverDay[] }
interface AccountDetail {
  accountId: string; accountName: string; accountNumber: string;
  summary: { totalDriverHours: number; totalIdleHours: number; idlePercent: number; rideshareSpend: number; recoverableSpend: number };
  byDriver: DriverDetail[];
  rides: Array<{ date: string; provider: string; riderName: string; fare: number; isRecoverable: boolean; rideStartLabel: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────
function fmt$(v: number) {
  return `$${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtHrs(h: number) { return `${h.toFixed(1)}h`; }

function RecBadge({ rec }: { rec: Recommendation }) {
  if (rec === "use_existing_drivers") return (
    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs no-default-active-elevate">
      <CheckCircle2 className="h-3 w-3 mr-1" />Use Existing Drivers
    </Badge>
  );
  if (rec === "add_chase_driver") return (
    <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs no-default-active-elevate">
      <Car className="h-3 w-3 mr-1" />Add Chase Driver
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground no-default-active-elevate">
      <AlertCircle className="h-3 w-3 mr-1" />Rideshare Appropriate
    </Badge>
  );
}

function IdlePill({ pct }: { pct: number }) {
  const color = pct > 60 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : pct > 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return <Badge className={`${color} border-0 text-xs no-default-active-elevate`}>{pct.toFixed(1)}%</Badge>;
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────────
interface Filters {
  dateFrom: string; dateTo: string; market: string; driverRate: string; accountSearch: string;
}

function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const F = filters;
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters({ ...F, [key]: e.target.value });

  return (
    <div className="flex flex-wrap gap-3 items-end bg-muted/40 border rounded-lg px-4 py-3">
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input type="date" value={F.dateFrom} onChange={set("dateFrom")} className="h-8 text-xs w-36" data-testid="input-optreport-from" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input type="date" value={F.dateTo} onChange={set("dateTo")} className="h-8 text-xs w-36" data-testid="input-optreport-to" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Market</Label>
        <Input placeholder="Any" value={F.market} onChange={set("market")} className="h-8 text-xs w-28" data-testid="input-optreport-market" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Driver Rate ($/hr)</Label>
        <Input type="number" value={F.driverRate} onChange={set("driverRate")} className="h-8 text-xs w-24" min="10" step="0.5" data-testid="input-optreport-rate" />
      </div>
      <div className="space-y-1 flex-1 min-w-40">
        <Label className="text-xs">Account Search</Label>
        <Input placeholder="Search accounts..." value={F.accountSearch} onChange={set("accountSearch")} className="h-8 text-xs" data-testid="input-optreport-account" />
      </div>
    </div>
  );
}

// ─── Tab 1: Account Summary ───────────────────────────────────────────────────────
function AccountSummaryTab({
  filters, onSelectAccount,
}: { filters: Filters; onSelectAccount: (id: string) => void }) {
  const { dateFrom, dateTo, market, driverRate, accountSearch } = filters;

  const { data: utilData, isLoading: uLoading } = useQuery<{ results: UtilRow[] }>({
    queryKey: ["/api/corporate/rideshare/utilization-summary", dateFrom, dateTo, market],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      if (market) p.set("market", market);
      return fetch(`/api/corporate/rideshare/utilization?${p}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 5 * 60_000,
  });

  const { data: chaseData, isLoading: cLoading } = useQuery<{ results: ChaseRow[] }>({
    queryKey: ["/api/corporate/rideshare/chase-summary", dateFrom, dateTo, market, driverRate],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, driverRate });
      if (market) p.set("market", market);
      return fetch(`/api/corporate/rideshare/chase-opportunity?${p}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 5 * 60_000,
  });

  // Merge by accountId
  const chaseMap = new Map((chaseData?.results ?? []).map(r => [r.accountId, r]));
  const rows = (utilData?.results ?? [])
    .filter(r => !accountSearch || r.accountName.toLowerCase().includes(accountSearch.toLowerCase()) || r.accountNumber.includes(accountSearch))
    .map(u => ({ ...u, chase: chaseMap.get(u.accountId) }));

  const isLoading = uLoading || cLoading;

  // Aggregate KPIs
  const totalRideshare    = rows.reduce((s, r) => s + r.rideshareSpend, 0);
  const totalRecoverable  = rows.reduce((s, r) => s + r.recoverableSpend, 0);
  const totalDriverHrs    = rows.reduce((s, r) => s + r.totalDriverHours, 0);
  const totalChaseOpp     = rows.reduce((s, r) => s + Math.max(0, r.chase?.estimatedSavings ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Rideshare Spend", value: fmt$(totalRideshare), icon: <DollarSign className="h-4 w-4" />, color: "" },
          { label: "Recoverable Spend", value: fmt$(totalRecoverable), icon: <TrendingUp className="h-4 w-4" />, color: "text-green-600" },
          { label: "Driver Hours Logged", value: fmtHrs(totalDriverHrs), icon: <Users className="h-4 w-4" />, color: "" },
          { label: "Chase Driver Opp.", value: fmt$(totalChaseOpp), icon: <Car className="h-4 w-4" />, color: "text-blue-600" },
        ].map(k => (
          <Card key={k.label} data-testid={`card-optreport-${k.label.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{k.icon}<span className="text-xs">{k.label}</span></div>
              <p className={`text-xl font-semibold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Account Summary</CardTitle>
          <CardDescription className="text-xs">{rows.length} accounts · Click a row to drill into shift simulation and driver detail</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              No data found for the selected filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs text-right">Rideshare</TableHead>
                    <TableHead className="text-xs text-right">Driver Hrs</TableHead>
                    <TableHead className="text-xs text-center">Idle %</TableHead>
                    <TableHead className="text-xs text-right">Recoverable</TableHead>
                    <TableHead className="text-xs text-right">Chase Opp.</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow
                      key={row.accountId}
                      className="cursor-pointer"
                      onClick={() => onSelectAccount(row.accountId)}
                      data-testid={`row-optreport-${row.accountId}`}
                    >
                      <TableCell className="py-2">
                        <div className="font-medium text-sm">{row.accountName || "—"}</div>
                        {row.accountNumber && <div className="text-xs text-muted-foreground font-mono">{row.accountNumber}</div>}
                        {row.market && <div className="text-xs text-muted-foreground">{row.market}</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt$(row.rideshareSpend)}</TableCell>
                      <TableCell className="text-right text-sm">{row.totalDriverHours > 0 ? fmtHrs(row.totalDriverHours) : "—"}</TableCell>
                      <TableCell className="text-center">
                        {row.totalDriverHours > 0 ? <IdlePill pct={row.idlePercent} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600 dark:text-green-400">
                        {row.recoverableSpend > 0 ? fmt$(row.recoverableSpend) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-blue-600 dark:text-blue-400">
                        {(row.chase?.estimatedSavings ?? 0) > 0 ? fmt$(row.chase!.estimatedSavings) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><RecBadge rec={row.recommendation} /></TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Time-of-Day Analysis ──────────────────────────────────────────────────
function TimeOfDayTab({ filters }: { filters: Filters }) {
  const { dateFrom, dateTo, market } = filters;
  const [selectedAccount, setSelectedAccount] = useState("__all__");

  const { data: utilData } = useQuery<{ results: UtilRow[] }>({
    queryKey: ["/api/corporate/rideshare/utilization-tod", dateFrom, dateTo],
    queryFn: () => fetch(`/api/corporate/rideshare/utilization?dateFrom=${dateFrom}&dateTo=${dateTo}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
  const accountOptions = utilData?.results ?? [];

  const { data, isLoading } = useQuery<{ hourly: HourlyData[] }>({
    queryKey: ["/api/corporate/rideshare/time-of-day", dateFrom, dateTo, market, selectedAccount],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      if (market) p.set("market", market);
      if (selectedAccount !== "__all__") p.set("accountId", selectedAccount);
      return fetch(`/api/corporate/rideshare/time-of-day?${p}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 5 * 60_000,
  });

  const hourly = (data?.hourly ?? []).filter(h => h.hour >= 5 && h.hour <= 22); // 5AM to 10PM
  const peakHour = [...(hourly)].sort((a, b) => b.rideshareSpend - a.rideshareSpend)[0];
  const overlapHours = hourly.filter(h => h.hasOverlap).length;
  const totalSpend = hourly.reduce((s, h) => s + h.rideshareSpend, 0);

  return (
    <div className="space-y-4">
      {/* Account filter */}
      <div className="flex items-center gap-3">
        <Label className="text-xs whitespace-nowrap">Filter by Account</Label>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="h-8 text-xs w-64" data-testid="select-tod-account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Accounts</SelectItem>
            {accountOptions.map(a => (
              <SelectItem key={a.accountId} value={a.accountId}>{a.accountName} {a.accountNumber && `(${a.accountNumber})`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Peak Spend Hour", value: peakHour ? peakHour.label : "—", sub: peakHour ? fmt$(peakHour.rideshareSpend) : "" },
          { label: "Overlap Hours", value: overlapHours, sub: "Rideshare during idle", color: overlapHours > 0 ? "text-yellow-600" : "" },
          { label: "Total Rideshare", value: fmt$(totalSpend), sub: `${hourly.reduce((s, h) => s + h.rideshareCount, 0)} rides` },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className={`text-lg font-semibold ${k.color ?? ""}`} data-testid={`text-tod-${k.label.toLowerCase().replace(/\s/g, "-")}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-muted-foreground">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <>
          {/* Rideshare Spend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rideshare Spend by Hour</CardTitle>
              <CardDescription className="text-xs">Bars highlighted in amber indicate rideshare during estimated driver idle time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={42} />
                  <Tooltip
                    {...rechartsTooltipStyle}
                    formatter={(val: number) => [fmt$(val), "Spend"]}
                    labelFormatter={l => `Hour: ${l}`}
                  />
                  <Bar dataKey="rideshareSpend" name="Rideshare Spend" radius={[3, 3, 0, 0]}>
                    {hourly.map((h, i) => (
                      <Cell key={i} fill={h.hasOverlap ? "#f59e0b" : "hsl(var(--primary))"} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Driver Activity Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Driver Activity by Hour</CardTitle>
              <CardDescription className="text-xs">Busy minutes from move assignments vs estimated idle coverage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={hourly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}m`} width={42} />
                  <Tooltip {...rechartsTooltipStyle} formatter={(v: number, n: string) => [`${v}m`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="driverBusyMinutes" name="Busy (min)" fill="hsl(var(--primary))" opacity={0.75} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="estimatedIdleMinutes" name="Idle (min)" fill="#22c55e" opacity={0.55} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="rideshareCount" name="Rides" stroke="#f59e0b" dot={false} strokeWidth={2} yAxisId={0} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Tab 3: Shift Simulation ──────────────────────────────────────────────────────
function ShiftSimulationTab({ filters, preselectedAccountId }: { filters: Filters; preselectedAccountId: string | null }) {
  const { dateFrom, dateTo, driverRate } = filters;
  const [selectedAccount, setSelectedAccount] = useState(preselectedAccountId ?? "__none__");

  const { data: utilData } = useQuery<{ results: UtilRow[] }>({
    queryKey: ["/api/corporate/rideshare/utilization-sim", dateFrom, dateTo],
    queryFn: () => fetch(`/api/corporate/rideshare/utilization?dateFrom=${dateFrom}&dateTo=${dateTo}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
  const accounts = utilData?.results ?? [];

  const { data: simData, isLoading } = useQuery<{
    accountName: string; accountNumber: string; totalRideshareSpend: number; dayCount: number;
    simulations: SimulationRow[];
  }>({
    queryKey: ["/api/corporate/rideshare/shift-simulation", selectedAccount, dateFrom, dateTo, driverRate],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, driverRate });
      return fetch(`/api/corporate/rideshare/shift-simulation/${selectedAccount}?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!selectedAccount && selectedAccount !== "__none__",
    staleTime: 5 * 60_000,
  });

  const sims = simData?.simulations ?? [];
  const bestSim = [...sims].sort((a, b) => b.avgSavingsPerDay - a.avgSavingsPerDay)[0];

  return (
    <div className="space-y-4">
      {/* Account picker */}
      <div className="flex items-center gap-3">
        <Label className="text-xs whitespace-nowrap">Select Account</Label>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="h-8 text-xs w-72" data-testid="select-sim-account">
            <SelectValue placeholder="Pick an account to simulate..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Select account —</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.accountId} value={a.accountId}>
                {a.accountName} {a.accountNumber && `(${a.accountNumber})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedAccount === "__none__" ? (
        <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
          <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p>Select an account above to run the shift simulation</p>
          <p className="text-xs">Compares 4, 6, and 8-hour driver shifts against current rideshare cost</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : !simData || sims.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No rideshare data found for this account in the selected period.</div>
      ) : (
        <div className="space-y-4">
          {/* Context */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold">{simData.accountName}</h3>
              <p className="text-xs text-muted-foreground">{simData.dayCount} days analysed · Total rideshare spend: {fmt$(simData.totalRideshareSpend)}</p>
            </div>
            {bestSim?.isPositive && (
              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 no-default-active-elevate">
                Best: {bestSim.shiftHours}h shift · {fmt$(bestSim.avgSavingsPerDay)}/day savings
              </Badge>
            )}
          </div>

          {/* Simulation table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Shift</TableHead>
                    <TableHead className="text-xs">Best Time Window</TableHead>
                    <TableHead className="text-xs text-right">Driver Cost/Day</TableHead>
                    <TableHead className="text-xs text-right">Replaceable Rides/Day</TableHead>
                    <TableHead className="text-xs text-right">Rideshare Replaced/Day</TableHead>
                    <TableHead className="text-xs text-right">Savings/Day</TableHead>
                    <TableHead className="text-xs text-right">Weekly Proj.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sims.map(sim => {
                    const isBest = sim.shiftHours === bestSim?.shiftHours && bestSim?.isPositive;
                    return (
                      <TableRow key={sim.shiftHours} className={isBest ? "bg-green-50/60 dark:bg-green-950/20" : ""} data-testid={`row-sim-${sim.shiftHours}h`}>
                        <TableCell className="font-semibold text-sm">
                          {sim.shiftHours}h
                          {isBest && <Badge className="ml-2 text-xs bg-green-600 text-white border-0 no-default-active-elevate">Best</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{sim.timeWindowLabel}</TableCell>
                        <TableCell className="text-right text-sm">{fmt$(sim.driverCostPerDay)}</TableCell>
                        <TableCell className="text-right text-sm">{sim.avgReplaceableRides}</TableCell>
                        <TableCell className="text-right text-sm">{fmt$(sim.avgRideshareReplaced)}</TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${sim.isPositive ? "text-green-600" : "text-red-500"}`}>
                          {sim.isPositive ? "+" : ""}{fmt$(sim.avgSavingsPerDay)}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${sim.isPositive ? "text-green-600" : "text-red-500"}`}>
                          {sim.isPositive ? "+" : ""}{fmt$(sim.weeklyProjection)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Visual savings bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Savings by Shift Length</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={sims} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="shiftHours" tickFormatter={v => `${v}h shift`} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={48} />
                  <Tooltip {...rechartsTooltipStyle} formatter={(v: number, n: string) => [fmt$(v), n]} />
                  <Bar dataKey="avgSavingsPerDay" name="Avg Savings/Day" radius={[4, 4, 0, 0]}>
                    {sims.map((s, i) => (
                      <Cell key={i} fill={s.isPositive ? "#22c55e" : "#ef4444"} opacity={0.8} />
                    ))}
                  </Bar>
                  <Bar dataKey="driverCostPerDay" name="Driver Cost/Day" fill="hsl(var(--primary))" opacity={0.4} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Driver Detail ─────────────────────────────────────────────────────────
function DriverDetailTab({ filters, preselectedAccountId }: { filters: Filters; preselectedAccountId: string | null }) {
  const { dateFrom, dateTo } = filters;
  const [selectedAccount, setSelectedAccount] = useState(preselectedAccountId ?? "__none__");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const { data: utilData } = useQuery<{ results: UtilRow[] }>({
    queryKey: ["/api/corporate/rideshare/utilization-dd", dateFrom, dateTo],
    queryFn: () => fetch(`/api/corporate/rideshare/utilization?dateFrom=${dateFrom}&dateTo=${dateTo}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
  const accounts = utilData?.results ?? [];

  const { data: detail, isLoading } = useQuery<AccountDetail>({
    queryKey: ["/api/corporate/rideshare/utilization-detail", selectedAccount, dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      return fetch(`/api/corporate/rideshare/utilization/${selectedAccount}?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!selectedAccount && selectedAccount !== "__none__",
    staleTime: 5 * 60_000,
  });

  const s = detail?.summary;
  const recoverableRides = detail?.rides.filter(r => r.isRecoverable) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs whitespace-nowrap">Select Account</Label>
        <Select value={selectedAccount} onValueChange={v => { setSelectedAccount(v); setExpandedDriver(null); }}>
          <SelectTrigger className="h-8 text-xs w-72" data-testid="select-detail-account">
            <SelectValue placeholder="Pick an account..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Select account —</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.accountId} value={a.accountId}>{a.accountName} {a.accountNumber && `(${a.accountNumber})`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedAccount === "__none__" ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p>Select an account to view per-driver idle and overlap detail</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !detail ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No data found.</div>
      ) : (
        <div className="space-y-4">
          {/* Summary strip */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden">
              {[
                { label: "Driver Hours", value: fmtHrs(s.totalDriverHours) },
                { label: "Idle Hours",   value: fmtHrs(s.totalIdleHours), color: s.totalIdleHours > 5 ? "text-yellow-600" : "" },
                { label: "Idle %",       value: `${s.idlePercent.toFixed(1)}%` },
                { label: "RS Spend",     value: fmt$(s.rideshareSpend) },
                { label: "Recoverable",  value: fmt$(s.recoverableSpend), color: s.recoverableSpend > 0 ? "text-green-600" : "" },
              ].map(k => (
                <div key={k.label} className="bg-background px-4 py-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-base font-semibold ${k.color ?? ""}`}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Per-driver rows */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Driver Timelines</h3>
            {detail.byDriver.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No driver move data for this account in the period.</p>
            ) : detail.byDriver.map(driver => {
              const isExpanded = expandedDriver === driver.driverId;
              const driverIdleHrs = driver.days.reduce((s, d) => s + d.idleHrs, 0);
              return (
                <Card key={driver.driverId}>
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover-elevate rounded-lg"
                    onClick={() => setExpandedDriver(isExpanded ? null : driver.driverId)}
                    data-testid={`button-detail-driver-${driver.driverId}`}
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-sm">{driver.driverName || driver.driverId}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{driver.days.length} day{driver.days.length !== 1 ? "s" : ""}</span>
                          <span className={driverIdleHrs > 2 ? "text-yellow-600 font-medium" : ""}>{driverIdleHrs.toFixed(1)}h idle</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-3">
                      <div className="divide-y">
                        {driver.days.map(day => (
                          <div key={day.date} className="py-2.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span className="font-medium text-foreground">
                                {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              </span>
                              <span>{day.moveCount} move{day.moveCount !== 1 ? "s" : ""} · {day.shiftHrs}h shift · <span className={day.idleHrs > 1 ? "text-yellow-600 font-medium" : ""}>{day.idleHrs}h idle</span></span>
                            </div>
                            <div className="space-y-0.5">
                              {day.moves.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <ClipboardList className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-mono text-muted-foreground">{m.startLabel} – {m.endLabel}</span>
                                  <span className="truncate">{m.from} → {m.to}</span>
                                </div>
                              ))}
                              {day.idleWindows.map((w, i) => (
                                <div key={`idle-${i}`} className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span className="font-mono">{w.startLabel} – {w.endLabel}</span>
                                  <span className="text-muted-foreground">({w.durationMins} min idle)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Recoverable rides callout */}
          {recoverableRides.length > 0 && (
            <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {recoverableRides.length} rideshare ride{recoverableRides.length !== 1 ? "s" : ""} overlapped with driver idle time
                    </p>
                    <p className="text-xs text-green-600/80 dark:text-green-500/80 mt-0.5">
                      Recoverable spend: {fmt$(recoverableRides.reduce((s, r) => s + r.fare, 0))} — these rides could have been performed by an idle driver
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────────
type TabId = "summary" | "time-of-day" | "shift-simulation" | "driver-detail";

export default function RideshareOptimizationReport() {
  const today   = new Date().toISOString().slice(0, 10);
  const days90  = new Date(); days90.setDate(days90.getDate() - 90);
  const defFrom = days90.toISOString().slice(0, 10);

  const [activeTab, setActiveTab]   = useState<TabId>("summary");
  const [selectedAccountId, setSel] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    dateFrom: defFrom, dateTo: today, market: "", driverRate: "25", accountSearch: "",
  });

  const handleAccountSelect = (accountId: string) => {
    setSel(accountId);
    setActiveTab("driver-detail");
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: "summary",          label: "Account Summary",    icon: <BarChart3 className="h-4 w-4" /> },
    { id: "time-of-day",      label: "Time-of-Day",        icon: <Sun className="h-4 w-4" /> },
    { id: "shift-simulation", label: "Shift Simulation",   icon: <Calendar className="h-4 w-4" /> },
    { id: "driver-detail",    label: "Driver Detail",      icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground" data-testid="button-optreport-back">
                <ArrowLeft className="h-3.5 w-3.5" />Reports
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Utilization vs Rideshare Optimization</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyze when rideshare was used during driver idle time, quantify recoverable cost, and simulate dedicated driver shifts.
          </p>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} setFilters={setFilters} />

      {/* Tab navigation */}
      <div className="flex border-b overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground"
            }`}
            data-testid={`tab-optreport-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "summary"          && <AccountSummaryTab filters={filters} onSelectAccount={handleAccountSelect} />}
        {activeTab === "time-of-day"      && <TimeOfDayTab filters={filters} />}
        {activeTab === "shift-simulation" && <ShiftSimulationTab filters={filters} preselectedAccountId={selectedAccountId} />}
        {activeTab === "driver-detail"    && <DriverDetailTab filters={filters} preselectedAccountId={selectedAccountId} />}
      </div>
    </div>
  );
}
