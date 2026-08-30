import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertCircle, CalendarDays, Columns3, History, Info, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";

type Market = { name: string; account_count: number; active_account_count: number; states: string[] };
type Overview = {
  market?: string; asOf?: string; summary?: Record<string, unknown>; filters?: Record<string, unknown>;
  rows?: Record<string, unknown>[]; history?: Record<string, unknown>[]; limitations?: string[];
  readOnly?: boolean; source?: string;
};

const text = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const number = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const money = (value: unknown) => {
  const n = number(value);
  return n === null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
};
const pct = (value: unknown) => {
  const n = number(value);
  return n === null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
};
const date = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const yes = (value: unknown) => value === true || value === "true" || value === 1;

function Skeleton() {
  return <div className="space-y-4 animate-pulse"><div className="h-28 rounded-lg bg-muted" /><div className="h-16 rounded-lg bg-muted" /><div className="h-[420px] rounded-lg bg-muted" /></div>;
}

function StateMessage({ kind, onRetry }: { kind: "error" | "forbidden" | "empty"; onRetry?: () => void }) {
  const forbidden = kind === "forbidden";
  const empty = kind === "empty";
  return <div className="rounded-lg border border-dashed bg-card px-6 py-16 text-center">
    {forbidden ? <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /> : <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />}
    <h2 className="font-semibold">{forbidden ? "Pricing access is restricted" : empty ? "No production pricing matches these filters" : "Market pricing could not be loaded"}</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{forbidden ? "Your role does not have access to this read-only pricing view. Contact an administrator if you need visibility." : empty ? "Try another market, remove a filter, or adjust the effective date." : "The source returned an error. No pricing values have been estimated."}</p>
    {!forbidden && onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button>}
  </div>;
}

function Value({ value, className = "" }: { value: unknown; className?: string }) {
  return <span className={value === null || value === undefined || value === "" ? "text-muted-foreground/60" : className}>{text(value)}</span>;
}

export default function MarketPricingOverview() {
  const [marketSearch, setMarketSearch] = useState("");
  const [market, setMarket] = useState("");
  const [asOf, setAsOf] = useState("");
  const [productId, setProductId] = useState("all");
  const [driverModel, setDriverModel] = useState("all");
  const [pricingModel, setPricingModel] = useState("all");
  const [rateType, setRateType] = useState("all");
  const [status, setStatus] = useState("active");
  const [pricingScope, setPricingScope] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const markets = useQuery<Market[]>({
    queryKey: ["/api/corporate/market-pricing-overview/markets"],
    queryFn: async () => (await apiRequest("GET", "/api/corporate/market-pricing-overview/markets")).json(),
    staleTime: 5 * 60 * 1000,
  });
  const marketOptions = useMemo(() => (markets.data ?? []).filter(item => item.name.toLowerCase().includes(marketSearch.toLowerCase())), [markets.data, marketSearch]);
  const params = useMemo(() => {
    const q = new URLSearchParams();
    if (market) q.set("market", market);
    if (asOf) q.set("asOf", asOf);
    if (productId !== "all") q.set("productId", productId);
    if (driverModel !== "all") q.set("driverModel", driverModel);
    if (pricingModel !== "all") q.set("pricingModel", pricingModel);
    if (rateType !== "all") q.set("rateType", rateType);
    q.set("status", status); q.set("pricingScope", pricingScope);
    if (search) q.set("search", search);
    return q.toString();
  }, [market, asOf, productId, driverModel, pricingModel, rateType, status, pricingScope, search]);
  const overview = useQuery<Overview>({
    queryKey: ["/api/corporate/market-pricing-overview", params],
    queryFn: async () => (await apiRequest("GET", `/api/corporate/market-pricing-overview?${params}`)).json(),
    enabled: !!market,
    staleTime: 30 * 1000,
  });
  const rows = overview.data?.rows ?? [];
  const rowId = (row: Record<string, unknown>, index = 0) =>
    [row.account_id, row.product_id, row.position_id, row.rate_id ?? row.rate_type ?? index].map(value => String(value ?? "")).join(":");
  const selectedRows = rows.filter((row, index) => selected.includes(rowId(row, index)));
  const products = useMemo(() => [...new Map(rows.map(row => [String(row.product_id), text(row.product_name)])).entries()].filter(([id]) => id !== "undefined"), [rows]);
  const models = useMemo(() => [...new Set(rows.map(row => text(row.driver_model)).filter(x => x !== "—"))], [rows]);
  const pricingModels = useMemo(() => [...new Set(rows.map(row => text(row.pricing_model)).filter(x => x !== "—"))], [rows]);
  const rateTypes = useMemo(() => [...new Set(rows.map(row => text(row.rate_type)).filter(x => x !== "—"))], [rows]);
  const summary = overview.data?.summary ?? {};
  const filterCount = [productId !== "all", driverModel !== "all", pricingModel !== "all", rateType !== "all", status !== "active", pricingScope !== "all", !!asOf, !!search].filter(Boolean).length;
  const resetFilters = () => { setAsOf(""); setProductId("all"); setDriverModel("all"); setPricingModel("all"); setRateType("all"); setStatus("active"); setPricingScope("all"); setSearch(""); };
  const toggleSelected = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const apiErrorStatus = (overview.error as any)?.status ?? (markets.error as any)?.status;
  useEffect(() => {
    setProductId("all");
    setDriverModel("all");
    setPricingModel("all");
    setRateType("all");
    setSelected([]);
  }, [market]);

  return <TooltipProvider>
    <div data-ipad-module="market-pricing-overview" className="min-h-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Link href="/sales/pricing" className="hover:text-foreground">Sales / Pricing</Link><span>/</span><span>Market overview</span></div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#182039] dark:text-foreground">Market pricing overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Production account pricing by Account Detail Market. Read-only · source values shown as received.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 gap-1.5 px-2.5 font-normal"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Read-only</Badge>
          <Button variant="outline" size="sm" onClick={() => { markets.refetch(); overview.refetch(); }} disabled={overview.isFetching}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${overview.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </div>

      <Card className="overflow-visible border-[#dfe3ec] shadow-sm">
        <CardContent className="grid gap-3 p-3 md:grid-cols-[minmax(220px,1.1fr)_minmax(180px,.9fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Market</label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="h-10" data-touch-target="select-trigger"><SelectValue placeholder="Select a market…" /></SelectTrigger>
              <SelectContent>
                <div className="p-2"><Input value={marketSearch} onChange={e => setMarketSearch(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search markets…" className="h-8 text-xs" /></div>
                {marketOptions.map(item => <SelectItem key={item.name} value={item.name}>{item.name}<span className="ml-2 text-xs text-muted-foreground">{item.states.join(", ")} · {item.account_count} accounts</span></SelectItem>)}
                {marketOptions.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No markets found.</div>}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" /><span>{asOf ? `Effective on ${date(asOf)}` : "As of latest production values"}</span>
          </div>
          <div className="flex gap-2 md:justify-end"><Button variant="ghost" size="sm" onClick={resetFilters} disabled={filterCount === 0}>Clear filters{filterCount > 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-primary">{filterCount}</span>}</Button></div>
        </CardContent>
      </Card>

      {markets.isError ? <StateMessage kind={(markets.error as any)?.status === 403 ? "forbidden" : "error"} onRetry={() => markets.refetch()} /> : !market ? <StateMessage kind="empty" /> : overview.isLoading ? <Skeleton /> : overview.isError ? <StateMessage kind={apiErrorStatus === 403 ? "forbidden" : "error"} onRetry={() => overview.refetch()} /> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[["Accounts", summary.accountCount], ["Active configurations", summary.activePricingConfigurations], ["Products", summary.productCount], ["Pricing tiers", summary.pricingTiers], ["Last updated", date(summary.lastPricingUpdate)]].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-card px-4 py-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value === undefined || value === null ? "—" : text(value)}</p>{label === "Last updated" && summary.lastUpdatedBy ? <p className="text-[10px] text-muted-foreground">{text(summary.lastUpdatedBy)}</p> : null}</div>)}
        </div>
        <Card className="border-[#dfe3ec] shadow-sm">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
               <div><CardTitle className="text-base">{market}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{rows.length} pricing records · {overview.data?.asOf ? `As of ${date(overview.data.asOf)}` : "latest available"}{overview.data?.source ? ` · ${overview.data.source}` : ""}</p><p className="mt-1 text-[11px] text-muted-foreground">Locations: {Array.isArray(summary.locations) && summary.locations.length ? summary.locations.join(" · ") : "not recorded"} · Driver models: {Array.isArray(summary.driverModels) && summary.driverModels.length ? summary.driverModels.join(", ") : "not recorded"} · Cost basis: {Array.isArray(summary.costBases) && summary.costBases.length ? summary.costBases.join(", ") : "not recorded"} · Effective pricing: {date(summary.effectivePricingDate)}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Account, number, city…" className="h-9 w-[220px] pl-8 text-xs" /></div>
                <Button size="sm" variant={historyOpen ? "secondary" : "outline"} onClick={() => setHistoryOpen(!historyOpen)}><History className="mr-1.5 h-3.5 w-3.5" />History</Button>
                <Button size="sm" variant="outline" disabled={selectedRows.length < 2} onClick={() => setCompareOpen(true)}><Columns3 className="mr-1.5 h-3.5 w-3.5" />Compare{selectedRows.length > 0 && ` (${selectedRows.length})`}</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {[["Product", productId, setProductId, products], ["Driver model", driverModel, setDriverModel, models.map(x => [x, x])], ["Pricing model", pricingModel, setPricingModel, pricingModels.map(x => [x, x])], ["Rate type", rateType, setRateType, rateTypes.map(x => [x, x])]].map(([label, value, setter, options]: any) => <Select key={label} value={value} onValueChange={setter}><SelectTrigger className="h-8 w-auto min-w-[120px] text-xs"><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value="all">All {label}s</SelectItem>{options.map((option: any) => <SelectItem key={option[0]} value={option[0]}>{option[1]}</SelectItem>)}</SelectContent></Select>)}
              <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-8 w-[145px] text-xs" /></div>
              <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[112px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active only</SelectItem><SelectItem value="inactive">Inactive only</SelectItem><SelectItem value="all">All statuses</SelectItem></SelectContent></Select>
              <Select value={pricingScope} onValueChange={setPricingScope}><SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All pricing sources</SelectItem><SelectItem value="standard">Product defaults</SelectItem><SelectItem value="account_specific">Account overrides</SelectItem></SelectContent></Select>
              <Badge variant="outline" className="h-8 gap-1 px-2 text-[10px] font-normal text-muted-foreground"><Info className="h-3 w-3" />Tier unavailable</Badge>
            </div>
          </CardHeader>
          <div data-ipad-table="market-pricing" className="max-w-full overflow-x-auto">
            <Table className="min-w-[1540px] text-xs">
              <TableHeader><TableRow className="bg-muted/55 hover:bg-muted/55"><TableHead className="sticky left-0 z-20 w-8 bg-muted/90"></TableHead><TableHead className="sticky left-8 z-20 min-w-[210px] bg-muted/90">Market / account</TableHead><TableHead className="sticky left-[218px] z-20 min-w-[190px] bg-muted/90">Product / service</TableHead><TableHead>Pricing source / tier</TableHead><TableHead>Driver model</TableHead><TableHead>Rate type / unit</TableHead><TableHead className="text-right">Service rate</TableHead><TableHead className="text-right">Standard</TableHead><TableHead className="text-right">Override</TableHead><TableHead className="text-right">Customer price</TableHead><TableHead className="text-right">Driver cost</TableHead><TableHead className="text-right">Margin</TableHead><TableHead>Effective → end</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={15}><StateMessage kind="empty" /></TableCell></TableRow> : rows.map((row, index) => {
                const id = rowId(row, index); const override = yes(row.has_account_specific_pricing) || row.price_override !== null && row.price_override !== undefined;
                return <TableRow key={id} className="group">
                  <TableCell className="sticky left-0 z-10 bg-card"><input aria-label={`Select ${text(row.account_name)}`} type="checkbox" checked={selected.includes(id)} onChange={() => toggleSelected(id)} className="h-4 w-4 accent-primary" /></TableCell>
                  <TableCell className="sticky left-8 z-10 bg-card"><Link href={`/customers/${row.account_id}`} className="font-semibold text-foreground hover:text-primary hover:underline">{text(row.account_name)}</Link><span className="block text-[10px] text-muted-foreground">{text(row.account_number)} · {text(row.city)}, {text(row.state)}</span></TableCell>
                  <TableCell className="sticky left-[218px] z-10 bg-card"><span className="font-medium">{text(row.product_name)}</span><span className="block text-[10px] text-muted-foreground">{text(row.billing_unit)} · {text(row.position_name)}</span></TableCell>
                  <TableCell>{text(row.price_source) === "account_service_rate" ? <Badge className="border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-50">Account service rate</Badge> : override ? <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">Account override</Badge> : <Badge variant="outline" className="border-slate-300 text-slate-600">Product default</Badge>}<span className="block text-[10px] text-muted-foreground">Tier: {text(row.pricing_tier, "not available")}</span>{yes(row.is_active) && <span className="ml-1 text-[10px] text-emerald-700">active</span>}</TableCell>
                  <TableCell><Value value={row.driver_model} /></TableCell><TableCell><Value value={row.rate_type} /><span className="block text-[10px] text-muted-foreground"><Value value={row.billing_unit} /></span></TableCell>
                  <TableCell className="text-right tabular-nums"><Value value={money(row.hourly_rate ?? row.per_move_rate ?? row.mileage_rate ?? row.rate)} /><span className="block text-[10px] text-muted-foreground">{row.hourly_rate !== null && row.hourly_rate !== undefined ? "hourly" : row.per_move_rate !== null && row.per_move_rate !== undefined ? "per move" : row.mileage_rate !== null && row.mileage_rate !== undefined ? "mileage" : ""}</span></TableCell>
                  <TableCell className="text-right tabular-nums"><Value value={money(row.standard_unit_price)} /></TableCell><TableCell className="text-right tabular-nums"><Value value={money(row.price_override)} /></TableCell><TableCell className="text-right font-semibold tabular-nums"><Value value={money(row.customer_price)} /></TableCell><TableCell className="text-right tabular-nums"><Value value={money(row.driver_cost)} /></TableCell>
                  <TableCell className="text-right tabular-nums"><Value value={money(row.configured_margin_dollars)} className="font-semibold" /><span className="block text-[10px] text-muted-foreground">{pct(row.configured_margin_pct)} · realized {pct(row.realized_margin_pct)}</span></TableCell>
                  <TableCell className="whitespace-nowrap"><Value value={date(row.rate_effective_date ?? row.product_effective_date ?? row.account_product_start_date)} /><span className="mx-1 text-muted-foreground">→</span><Value value={date(row.rate_end_date ?? row.account_product_end_date)} /></TableCell>
                  <TableCell>{yes(row.is_active) ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge> : <Badge variant="outline" className="border-slate-300 text-slate-500">Inactive</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground"><Value value={date(row.updated_at ?? row.last_updated_at)} /><span className="block text-[10px]"><Value value={row.updated_by ?? row.last_updated_by} /></span></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground"><span>Select two or more rows to compare pricing side by side.</span><span>{selectedRows.length} selected · {rows.length} visible</span></div>
        </Card>

        {historyOpen && <Card className="border-[#dfe3ec] shadow-sm"><CardHeader className="border-b px-4 py-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-muted-foreground" />Pricing history <span className="text-xs font-normal text-muted-foreground">separate from current production pricing</span></CardTitle></CardHeader><CardContent className="p-0">{(overview.data?.history ?? []).length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No historical pricing records were returned for this market.</p> : <div className="divide-y">{(overview.data?.history ?? []).map((item, i) => <div key={String(item.id ?? i)} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[1.2fr_1fr_1fr_1fr_2fr]"><span className="font-medium">{text(item.account_name)}<span className="block text-[10px] font-normal text-muted-foreground">{text(item.product_name)} · {text(item.position_name)}</span></span><span>{money(item.previous_rate)} → {money(item.new_rate)}</span><span>{date(item.changed_at)}</span><span><Badge variant="outline">{text(item.change_source ?? "historical")}</Badge></span><span className="text-muted-foreground">{text(item.notes, "No reason recorded")} · {text(item.changed_by_name, "Unknown user")}</span></div>)}</div>}</CardContent></Card>}
        {overview.data?.limitations?.length ? <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /><div><span className="font-semibold">Data limitations: </span>{overview.data.limitations.join(" ")}</div></div> : null}
      </>}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Compare selected pricing</DialogTitle></DialogHeader><div className="overflow-x-auto"><Table className="min-w-[720px] text-xs"><TableHeader><TableRow><TableHead>Field</TableHead>{selectedRows.map((row, index) => <TableHead key={rowId(row, index)}>{text(row.account_name)}<span className="block font-normal text-muted-foreground">{text(row.product_name)}</span></TableHead>)}</TableRow></TableHeader><TableBody>{[["Customer price", "customer_price", money], ["Standard unit price", "standard_unit_price", money], ["Account override", "price_override", money], ["Driver cost", "driver_cost", money], ["Configured margin", "configured_margin_dollars", money], ["Configured margin %", "configured_margin_pct", pct], ["Rate type", "rate_type", text], ["Effective date", "rate_effective_date", date], ["Pricing source", "price_source", text]].map(([label, key, format]: any) => <TableRow key={String(key)}><TableCell className="font-medium">{label}</TableCell>{selectedRows.map((row, index) => <TableCell key={rowId(row, index)} className="tabular-nums">{format(row[key])}</TableCell>)}</TableRow>)}</TableBody></Table></div></DialogContent></Dialog>
    </div>
  </TooltipProvider>;
}