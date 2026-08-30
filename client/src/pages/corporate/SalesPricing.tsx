import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calculator, Edit3, History, Info, LockKeyhole, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const request = async (method: string, url: string, body?: unknown) => (await apiRequest(method, url, body)).json();
const currency = (value: unknown) => value == null ? "—" : `$${Number(value).toFixed(2)}`;
const prettyDate = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function Field({ label, ...props }: { label: string; [key: string]: unknown }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label><Input className="h-9" {...props as any} /></div>;
}

function EditorDialog({ open, onOpenChange, market, onSaved }: any) {
  const [form, setForm] = useState({ name: "", state: "", status: "active" });
  useEffect(() => setForm({ name: market?.name ?? "", state: market?.state ?? "", status: market?.status ?? "active" }), [market, open]);
  const mutation = useMutation({
    mutationFn: () => request(market ? "PATCH" : "POST", market ? `/api/sales/pricing/markets/${market.id}` : "/api/sales/pricing/markets", form),
    onSuccess: () => { onSaved(); onOpenChange(false); },
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>{market ? "Edit market" : "Add market"}</DialogTitle></DialogHeader>
    <div className="grid grid-cols-2 gap-3"><Field label="Market name" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><Field label="State" value={form.state} maxLength={2} onChange={(e: any) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div>
    <div className="space-y-1"><Label className="text-xs">Status</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    {mutation.isError && <p className="text-sm text-destructive">Could not save market. Please retry.</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!form.name || form.state.length !== 2 || mutation.isPending} onClick={() => mutation.mutate()}>Save market</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function NewRateDialog({ open, onOpenChange, market, onCreated }: any) {
  const [rate, setRate] = useState(""); const [effectiveDate, setEffectiveDate] = useState("");
  const mutation = useMutation({ mutationFn: () => request("POST", `/api/sales/pricing/markets/${market.id}/rates`, { shiftHourlyRate: rate, effectiveDate }), onSuccess: r => { onCreated(r); onOpenChange(false); } });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Draft a new rate</DialogTitle></DialogHeader>
    <p className="rounded bg-muted p-3 text-xs">Creates a preserved, effective-dated draft. It does not change live account or completed-move pricing.</p>
    <div className="grid grid-cols-2 gap-3"><Field label="Shift rate / hour" type="number" value={rate} onChange={(e: any) => setRate(e.target.value)} /><Field label="Effective date" type="date" value={effectiveDate} onChange={(e: any) => setEffectiveDate(e.target.value)} /></div>
    {mutation.isError && <p className="text-sm text-destructive">Could not create rate draft. Please retry.</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!rate || !effectiveDate || mutation.isPending} onClick={() => mutation.mutate()}>Create draft</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function PublishDialog({ open, onOpenChange, market, rate, onPublished }: any) {
  const [mode, setMode] = useState("new_only"); const [selected, setSelected] = useState<string[]>([]); const [preview, setPreview] = useState<any>(); const [confirmed, setConfirmed] = useState(false);
  const candidates = useQuery<any[]>({
    queryKey: ["/api/sales/pricing/markets", market?.id, "account-candidates", rate?.effective_date],
    queryFn: () => request("GET", `/api/sales/pricing/markets/${market.id}/account-candidates?effectiveDate=${encodeURIComponent(rate.effective_date)}`),
    enabled: open && !!market && !!rate?.effective_date,
  });
  const previewMutation = useMutation({ mutationFn: () => request("POST", "/api/sales/pricing/rate-applications/preview", { marketRateVersionId: rate.id, applicationMode: mode, selectedAccountIds: selected }), onSuccess: setPreview });
  const publishMutation = useMutation({ mutationFn: () => request("POST", "/api/sales/pricing/rate-applications/publish", { marketRateVersionId: rate.id, applicationMode: mode, selectedAccountIds: selected, explicitlyConfirmed: true }), onSuccess: () => { onPublished(); onOpenChange(false); } });
  useEffect(() => { setPreview(undefined); setConfirmed(false); setSelected([]); }, [mode]);
  useEffect(() => { setPreview(undefined); setConfirmed(false); }, [selected.join(",")]);
  const existing = mode !== "new_only";
  const accounts = (candidates.data ?? []).filter(a => mode !== "selected_existing" || a.treatment === "automatic");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Publish {market?.name} rate · {currency(rate?.shift_hourly_rate)}/hr</DialogTitle></DialogHeader>
    <div className="grid grid-cols-3 gap-2">{[["new_only", "New customers only"], ["all_eligible", "All eligible"], ["selected_existing", "Selected + new"]].map(([value, label]) => <button key={value} className={`rounded border p-3 text-left text-xs ${mode === value ? "border-primary bg-primary/5" : ""}`} onClick={() => setMode(value)}>{label}</button>)}</div>
    <div className={`rounded border p-3 text-xs ${existing ? "border-amber-200 bg-amber-50" : "bg-muted/50"}`}>
      <b>Preview required before publishing.</b>
      <p className="mt-1 text-muted-foreground">{existing ? "Review the affected existing accounts and exclusions before confirming." : "This mode affects new customers only; the preview confirms that no existing account is targeted."}</p>
      {mode === "selected_existing" && <div className="mt-2 max-h-32 overflow-auto bg-background">{accounts.map(a => <label className="flex gap-2 p-1" key={a.account_id}><input type="checkbox" checked={selected.includes(a.account_id)} onChange={e => setSelected(e.target.checked ? [...selected, a.account_id] : selected.filter(id => id !== a.account_id))} />{a.account_name}<span className="ml-auto">{a.service_model}</span></label>)}</div>}
      <Button size="sm" variant="outline" className="mt-2" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || (mode === "selected_existing" && selected.length === 0)}>{previewMutation.isPending ? "Calculating…" : "Run impact preview"}</Button>
    </div>
    {preview && <div className="grid grid-cols-4 gap-2 text-xs">{[["Active", preview.activeAccounts], ["Affected", preview.affectedCount], ["Contract locked", preview.contractLockedAccounts], ["Approval required", preview.approvalRequiredAccounts]].map(([label, value]) => <div className="rounded bg-muted p-2" key={label}><b>{value ?? 0}</b><span className="block text-muted-foreground">{label}</span></div>)}<div className="col-span-4 divide-y border bg-background">{(preview.affectedAccounts ?? []).map((a: any) => <div className="flex justify-between p-2" key={a.account_id}><span>{a.account_name}</span><span>{a.service_model} · {a.treatment}</span></div>)}</div></div>}
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm this is future pricing administration only; it does not reprice completed moves or mutate live account/booking rates.</label>
    {(previewMutation.isError || publishMutation.isError) && <p className="text-sm text-destructive">The pricing operation failed. Review the inputs and retry.</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!preview || !confirmed || publishMutation.isPending} onClick={() => publishMutation.mutate()}>Confirm & publish</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function RuleForm({ initial, onSubmit, onCancel, pending }: any) {
  const [form, setForm] = useState({
    effectiveDate: new Date().toISOString().slice(0, 10),
    shiftMultiplier: initial?.shift_multiplier ?? "1.00",
    ddStandardMultiplier: initial?.dd_standard_multiplier ?? "1.25",
    ddPreferredMultiplier: initial?.dd_preferred_multiplier ?? "1.20",
    ddPreferredPlusMultiplier: initial?.dd_preferred_plus_multiplier ?? "1.15",
    preferredThreshold: String(initial?.preferred_threshold ?? 50),
    preferredPlusThreshold: String(initial?.preferred_plus_threshold ?? 100),
    shiftOpportunityThreshold: String(initial?.shift_opportunity_threshold ?? 125),
    newAccountDays: String(initial?.new_account_days ?? 90),
  });
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <form className="grid grid-cols-2 gap-3" onSubmit={event => {
    event.preventDefault();
    onSubmit({
      ...form,
      preferredThreshold: Number(form.preferredThreshold),
      preferredPlusThreshold: Number(form.preferredPlusThreshold),
      shiftOpportunityThreshold: Number(form.shiftOpportunityThreshold),
      newAccountDays: Number(form.newAccountDays),
    });
  }}>
    <Field label="Effective date" type="date" value={form.effectiveDate} onChange={(event: any) => set("effectiveDate", event.target.value)} />
    {([["shiftMultiplier", "Shift"], ["ddStandardMultiplier", "Standard"], ["ddPreferredMultiplier", "Preferred"], ["ddPreferredPlusMultiplier", "Preferred Plus"]] as const).map(([key, label]) => <Field key={key} label={`${label} multiplier`} type="number" step="0.01" value={form[key]} onChange={(event: any) => set(key, event.target.value)} />)}
    {([["preferredThreshold", "Preferred threshold"], ["preferredPlusThreshold", "Preferred Plus threshold"], ["shiftOpportunityThreshold", "Shift opportunity threshold"], ["newAccountDays", "New account period (days)"]] as const).map(([key, label]) => <Field key={key} label={label} type="number" value={form[key]} onChange={(event: any) => set(key, event.target.value)} />)}
    <DialogFooter className="col-span-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Publishing…" : "Publish rules"}</Button></DialogFooter>
  </form>;
}

const methodology: [string, string, string][] = [
  ["Pricing Philosophy", "Use one visible market baseline so Sales can explain the relationship between utilization and service model.", "Consistency builds trust while preserving room for account controls."],
  ["Shift Market Rate", "The current effective Shift hourly rate is the market baseline.", "It anchors DriverDash and future service comparisons to a real operating market."],
  ["DriverDash Pricing", "DriverDash hourly pricing is the Shift Market Rate multiplied by the applicable tier multiplier.", "The tier structure rewards sustained volume without pricing below the approved floor."],
  ["New Account 90-Day Pricing", "New DriverDash accounts use Standard pricing for their first 90 days.", "A stable introductory period avoids retroactive changes while usage patterns form."],
  ["DriverDash Volume Pricing", "0–49 moves is Standard, 50–99 is Preferred, and 100+ is Preferred Plus after the introductory period.", "Pricing recognizes utilization while stopping automatic declines at Preferred Plus."],
  ["Trailing 90-Day Volume Review", "At 90 days and monthly thereafter, review trailing 90 days of completed DriverDash moves prospectively.", "Completed moves are historical records and must never be repriced."],
  ["DriverShift Opportunity Threshold", "At 125+ average monthly completed moves, flag Shift Opportunity; this is not another discount tier.", "Sales can evaluate concentration, dedicated-driver utilization, and DriverShift fit."],
  ["Hybrid / DriverShift Conversion Strategy", "DriverShift and Hybrid conversion is a Sales evaluation path, not a finalized Phase 1 calculation.", "The opportunity stays visible without inventing production formulas."],
  ["Market Rate Changes", "Rates are versioned and effective-dated; prior versions remain attached to historical pricing records.", "Versioning provides a reliable audit trail and predictable future administration."],
  ["Existing vs. New Customer Pricing", "A new rate may apply to new customers only, all eligible customers, or selected existing customers after preview.", "Explicit application protects contracts and makes change management deliberate."],
  ["Account Pricing Controls", "Automatic accounts follow updates; Approval Required waits for approval; Contract Locked remains on its contracted version.", "These controls prevent silent changes to customer commitments."],
  ["Contract Pricing Overrides", "Future overrides store type, rate/multiplier, reason, dates, authorizer, and timestamps.", "An override is visible governance, not a silent replacement of market pricing."],
  ["Sales Positioning", "Lead with the market baseline, explain the volume path, and use Shift Opportunity as a conversation starter.", "The model supports a commercial conversation without promising unfinished components."],
  ["Pricing Calculation Examples", "A $23.70 Shift rate at 1.25× produces $29.625, displayed as $29.63/hour.", "Rates are rounded for display only; future components remain unfinalized."],
];

export default function SalesPricing() {
  const [location, setLocation] = useLocation();
  const [tab, setTab] = useState(location.includes("/reference") ? "reference" : "market");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [rateOpen, setRateOpen] = useState(false);
  const [market, setMarket] = useState<any>();
  const [publishRate, setPublishRate] = useState<any>();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [calculatorForm, setCalculatorForm] = useState({ marketId: "", serviceModel: "driverdash", accountAgeDays: "90", averageMonthlyCompletedMoves: "0" });
  const queryClient = useQueryClient();
  const auth = useQuery<any>({ queryKey: ["/api/sales/pricing/authorization/status"] });
  const markets = useQuery<any[]>({ queryKey: ["/api/sales/pricing/markets"] });
  const rules = useQuery<any>({ queryKey: ["/api/sales/pricing/company-rules"] });
  const audits = useQuery<any[]>({ queryKey: ["/api/sales/pricing/audits"] });
  const detail = useQuery<any>({ queryKey: ["/api/sales/pricing/markets", market?.id], queryFn: () => request("GET", `/api/sales/pricing/markets/${market.id}`), enabled: !!market });
  const calculator = useMutation({ mutationFn: () => request("POST", "/api/sales/pricing/calculator", { ...calculatorForm, accountAgeDays: Number(calculatorForm.accountAgeDays), averageMonthlyCompletedMoves: Number(calculatorForm.averageMonthlyCompletedMoves) }) });
  const saveRules = useMutation({
    mutationFn: (body: unknown) => request("POST", "/api/sales/pricing/company-rules", body),
    onSuccess: () => { setRulesOpen(false); refresh(); },
  });
  const canEdit = auth.data?.canEdit === true;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/sales/pricing"] });
  const changeTab = (next: string) => { setTab(next); setLocation(next === "reference" ? "/sales/pricing/reference" : "/sales/pricing"); };
  useEffect(() => setTab(location.includes("/reference") ? "reference" : "market"), [location]);
  if (auth.isLoading) return <div className="space-y-3 p-6"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-40 animate-pulse rounded bg-muted" /></div>;
  if (auth.isError || markets.isError) return <div className="m-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="mr-2 inline h-4 w-4" />Unable to load pricing data. <button className="underline" onClick={() => { auth.refetch(); markets.refetch(); }}>Retry</button></div>;
  if (!auth.data?.canView) return <div className="p-12 text-center"><LockKeyhole className="mx-auto mb-3" /><b>Pricing access required</b></div>;
  const currentRules = rules.data?.current;
  return <div data-ipad-module="sales-pricing" className="min-h-full bg-[#f7f8fc]">
    <header className="sticky top-0 z-10 border-b bg-background p-4"><p className="text-xs text-muted-foreground">Sales / Pricing</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Pricing workspace</h1><div className="ml-auto flex gap-2">{canEdit && <Button onClick={() => { setEditing(undefined); setEditorOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add market</Button>}<Button variant="outline" onClick={refresh}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button></div></div><div className="mt-3 flex gap-4"><button className={tab === "market" ? "border-b-2 border-primary p-2" : "p-2"} onClick={() => changeTab("market")}>Market Pricing</button><button className={tab === "reference" ? "border-b-2 border-primary p-2" : "p-2"} onClick={() => changeTab("reference")}>Pricing Reference</button></div></header>
    {tab === "market" ? <main className="space-y-4 p-4"><div className="rounded border bg-[#eef1f8] p-3 text-sm"><ShieldCheck className="mr-2 inline h-4 w-4" />{canEdit ? "Will Walton editor access" : "Read-only view — pricing changes are administered by Will Walton."}</div>
      <div className="overflow-x-auto rounded border bg-background"><table data-ipad-table="pricing" className="min-w-[1150px] w-full text-xs"><thead className="bg-muted"><tr>{["Market / State", "Shift rate", "Effective", "Standard", "Preferred", "Preferred Plus", "Shift trigger", "Status", "Modified by", "Actions"].map(x => <th className="p-3 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{(markets.data ?? []).map(m => <tr className="border-t" key={m.id} onClick={() => setMarket(m)}><td className="p-3 font-semibold">{m.name} <span className="font-mono">{m.state}</span></td><td className="p-3">{currency(m.shift_hourly_rate)}</td><td className="p-3">{prettyDate(m.rate_effective_date)}</td>{[["standard", "dd_standard_multiplier"], ["preferred", "dd_preferred_multiplier"], ["preferredPlus", "dd_preferred_plus_multiplier"]].map(x => <td className="p-3" key={x[0]}>{currentRules?.[x[1]] ?? "—"}×<br /><b>{currency(m.calculatedRates?.[x[0]])}/hr</b></td>)}<td className="p-3">{currentRules?.shift_opportunity_threshold ?? "—"}+</td><td className="p-3">{m.status}</td><td className="p-3">{m.updated_by ?? m.created_by ?? "—"}</td><td className="p-3">{canEdit && <><Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); setEditing(m); setEditorOpen(true); }}><Edit3 /></Button><Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); setMarket(m); setRateOpen(true); }}><Plus /></Button></>}</td></tr>)}</tbody></table></div>
      {market && <div className="rounded border bg-background p-4"><h2 className="font-semibold">Rate history · {market.name}</h2>{(detail.data?.rateHistory ?? []).map((r: any) => <div className="flex flex-wrap items-center gap-4 border-t p-2 text-xs" key={r.id}><History className="h-4 w-4" /><b>v{r.version}</b><span>{currency(r.shift_hourly_rate)}</span><span>{prettyDate(r.effective_date)}</span><span>{r.status}</span><span>Created {r.created_by ?? "—"} · Published {r.published_by ?? "—"}</span>{canEdit && r.status === "draft" && <Button size="sm" onClick={() => setPublishRate(r)}>Publish</Button>}</div>)}</div>}
      <div className="grid gap-4 lg:grid-cols-2"><div className="rounded border bg-background p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Company rule summary</h2>{canEdit && <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)}><Edit3 className="mr-1 h-3.5 w-3.5" />Manage rules</Button>}</div><p className="mt-2 text-xs text-muted-foreground">Standard {currentRules?.dd_standard_multiplier ?? "—"}× · Preferred {currentRules?.dd_preferred_multiplier ?? "—"}× · Preferred Plus {currentRules?.dd_preferred_plus_multiplier ?? "—"}× · Shift trigger {currentRules?.shift_opportunity_threshold ?? "—"}+.</p>{saveRules.isError && <p className="mt-2 text-xs text-destructive">Could not publish pricing rules. Review the values and retry.</p>}</div><div className="rounded border bg-background p-4"><h2 className="font-semibold">Audit history</h2>{(audits.data ?? []).slice(0, 5).map(a => <div className="border-t p-2 text-xs" key={a.id}>{a.action} · {prettyDate(a.created_at)}</div>)}</div></div>
    </main> : <main className="space-y-4 p-4"><div className="rounded border bg-background p-4"><h2 className="font-semibold"><Calculator className="mr-2 inline h-4 w-4" />Internal pricing calculator</h2><div className="mt-3 grid gap-3 md:grid-cols-4"><select className="h-9 rounded border" value={calculatorForm.marketId} onChange={e => setCalculatorForm({ ...calculatorForm, marketId: e.target.value })}><option value="">Market</option>{(markets.data ?? []).map(m => <option key={m.id} value={m.id}>{m.name}, {m.state}</option>)}</select><select className="h-9 rounded border" value={calculatorForm.serviceModel} onChange={e => setCalculatorForm({ ...calculatorForm, serviceModel: e.target.value })}><option value="driverdash">DriverDash</option><option value="drivershift">DriverShift</option></select><Field label="Account age (days)" type="number" value={calculatorForm.accountAgeDays} onChange={(e: any) => setCalculatorForm({ ...calculatorForm, accountAgeDays: e.target.value })} /><Field label="Avg monthly completed moves" type="number" value={calculatorForm.averageMonthlyCompletedMoves} onChange={(e: any) => setCalculatorForm({ ...calculatorForm, averageMonthlyCompletedMoves: e.target.value })} /></div><Button className="mt-3" disabled={!calculatorForm.marketId} onClick={() => calculator.mutate()}>Calculate</Button>{calculator.data && <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{Object.entries({ Rate: currency((calculator.data as any).shiftMarketRate), Tier: (calculator.data as any).tier, Multiplier: `${(calculator.data as any).multiplier}×`, "Hourly rate": currency((calculator.data as any).hourlyRate), "Next tier": (calculator.data as any).nextTier ?? "None", "Moves remaining": (calculator.data as any).movesRequiredForNextTier ?? "—", "Shift threshold": `${(calculator.data as any).shiftOpportunityThreshold}+`, Opportunity: (calculator.data as any).shiftOpportunity ? "Yes" : "Not yet" }).map(x => <div className="rounded bg-muted p-2" key={x[0]}><b>{String(x[1])}</b><span className="block text-muted-foreground">{x[0]}</span></div>)}</div>}<p className="mt-2 text-xs text-muted-foreground"><Info className="mr-1 inline h-3 w-3" />Informational only.</p></div>{methodology.map(([title, how, why], i) => <div className="rounded border bg-background p-4" key={title}><b>{i + 1}. {title}</b><p className="mt-2 text-sm"><b>How:</b> {how}</p><p className="mt-1 text-xs text-muted-foreground"><b>Why:</b> {why}</p></div>)}<div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm"><b>Future / not finalized:</b> Priority, Rush/Emergency, mileage, repositioning, minimum move charges, and final Hybrid pricing.</div></main>}
    <EditorDialog open={editorOpen} onOpenChange={setEditorOpen} market={editing} onSaved={refresh} /><NewRateDialog open={rateOpen} onOpenChange={setRateOpen} market={market} onCreated={r => { setPublishRate(r); refresh(); }} /><PublishDialog open={!!publishRate} onOpenChange={v => !v && setPublishRate(undefined)} market={market} rate={publishRate} onPublished={refresh} />
    <Dialog open={rulesOpen} onOpenChange={setRulesOpen}><DialogContent><DialogHeader><DialogTitle>Manage company pricing rules</DialogTitle></DialogHeader><RuleForm initial={currentRules} pending={saveRules.isPending} onCancel={() => setRulesOpen(false)} onSubmit={(body: unknown) => saveRules.mutate(body)} /></DialogContent></Dialog>
  </div>;
}