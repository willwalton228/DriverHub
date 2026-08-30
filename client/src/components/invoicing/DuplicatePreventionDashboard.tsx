import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck, ShieldAlert, AlertCircle, RefreshCw,
  CreditCard, FileText, Receipt, ChevronDown, ChevronUp,
  Info, CheckCircle2, XCircle, Clock
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DupPayment {
  id1: string; ref1: string; amount: string; payment_method: string; payment_date: string;
  id2: string; ref2: string; date2: string;
  customer_name: string;
}

interface DupInvoice {
  id1: string; ref1: string; amount: string; invoice_date: string;
  id2: string; ref2: string; date2: string;
  customer_name: string;
}

interface DupCharge {
  id1: string; desc1: string; amount: string; charge_date: string;
  id2: string; desc2: string; date2: string;
  customer_name: string;
}

interface EngineConfig {
  hardDuplicate: string;
  softDuplicate: string;
  bypassable: boolean;
  windowDays: number;
}

interface ScanResult {
  scannedAt: string;
  summary: {
    potentialDuplicatePayments: number;
    potentialDuplicateInvoices: number;
    potentialDuplicateCharges: number;
    total: number;
  };
  duplicatePayments: DupPayment[];
  duplicateInvoices: DupInvoice[];
  duplicateCharges: DupCharge[];
  config: {
    payments: EngineConfig;
    invoices: EngineConfig;
    charges: EngineConfig;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

function fmtAmt(a: string | number) {
  const n = typeof a === "string" ? parseFloat(a) : a;
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

function fmtMethod(m: string) {
  const map: Record<string, string> = {
    check: "Check", wire: "Wire", ach: "ACH", ach_manual: "ACH (Manual)",
    credit_card: "Credit Card", cash: "Cash", stripe: "Stripe",
  };
  return map[m] ?? m;
}

// ─── Engine Rule Card ─────────────────────────────────────────────────────────

function EngineRuleCard({
  icon, title, config, count, colorKey,
}: {
  icon: React.ReactNode;
  title: string;
  config: EngineConfig;
  count: number;
  colorKey: "blue" | "green" | "orange";
}) {
  const colors = {
    blue:   { bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", icon: "text-blue-600 dark:text-blue-400", badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
    green:  { bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", icon: "text-green-600 dark:text-green-400", badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
    orange: { bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800", icon: "text-orange-600 dark:text-orange-400", badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  };
  const c = colors[colorKey];

  return (
    <Card className={`border ${c.bg}`}>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={c.icon}>{icon}</span>
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <Badge className={`text-xs no-default-active-elevate ${count > 0 ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"}`}>
            {count > 0 ? <AlertCircle className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
            {count > 0 ? `${count} flagged` : "Clear"}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Hard Block: </span>
              <span className="text-muted-foreground">{config.hardDuplicate}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Soft Flag ({config.windowDays}d window): </span>
              <span className="text-muted-foreground">{config.softDuplicate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-muted-foreground">Soft duplicates can be overridden with an explicit "Post Anyway" confirmation.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Duplicate Pair Table ─────────────────────────────────────────────────────

function DuplicatePairTable({
  title, icon, pairs, renderRow, colorKey,
}: {
  title: string;
  icon: React.ReactNode;
  pairs: any[];
  renderRow: (pair: any, i: number) => React.ReactNode;
  colorKey: "blue" | "green" | "orange";
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pairs : pairs.slice(0, 5);

  const headerColors = {
    blue:   "text-blue-700 dark:text-blue-400",
    green:  "text-green-700 dark:text-green-400",
    orange: "text-orange-700 dark:text-orange-400",
  };

  if (pairs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={headerColors[colorKey]}>{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs no-default-active-elevate">
          {pairs.length} pair{pairs.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="bg-muted/50 border-b text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Account</th>
              <th className="text-left px-3 py-2 font-medium">Record A</th>
              <th className="text-left px-3 py-2 font-medium">Record B</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Date A</th>
              <th className="text-left px-3 py-2 font-medium">Date B</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((pair, i) => renderRow(pair, i))}
          </tbody>
        </table>
      </div>
      {pairs.length > 5 && (
        <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} className="text-xs">
          {expanded ? <><ChevronUp className="w-3 h-3 mr-1" />Show less</> : <><ChevronDown className="w-3 h-3 mr-1" />Show {pairs.length - 5} more</>}
        </Button>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DuplicatePreventionDashboard() {
  const qc = useQueryClient();

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery<ScanResult>({
    queryKey: ["/api/corporate/invoicing/duplicate-prevention/scan"],
    queryFn: () => apiRequest("GET", "/api/corporate/invoicing/duplicate-prevention/scan").then(r => r.json()),
    staleTime: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/duplicate-prevention/scan"] });

  const total = data?.summary.total ?? 0;
  const allClear = !isLoading && total === 0;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Duplicate Prevention Engine</h2>
            {allClear
              ? <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs no-default-active-elevate"><CheckCircle2 className="w-3 h-3 mr-1" />All Clear</Badge>
              : total > 0
              ? <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs no-default-active-elevate"><AlertCircle className="w-3 h-3 mr-1" />{total} Flagged</Badge>
              : null
            }
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active duplicate prevention across payments, invoices, and billable charges.
            {dataUpdatedAt ? ` Last scanned: ${format(new Date(dataUpdatedAt), "h:mm a")}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching} data-testid="button-refresh-dup-scan">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Scanning..." : "Refresh Scan"}
        </Button>
      </div>

      {/* ── How it works info banner ── */}
      <div className="flex items-start gap-2.5 rounded-md border px-4 py-3 bg-muted/30">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          The Duplicate Prevention Engine runs automatically on every payment, invoice, and charge creation attempt.
          <strong className="text-foreground"> Hard duplicates</strong> are blocked outright with a 409 error.
          <strong className="text-foreground"> Soft duplicates</strong> surface an inline warning — users can review or override with explicit confirmation.
          All overrides are logged to the financial audit trail.
        </p>
      </div>

      {/* ── KPI row ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Flagged",     value: total,                                  cls: total > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400" },
            { label: "Duplicate Payments", value: data?.summary.potentialDuplicatePayments ?? 0, cls: (data?.summary.potentialDuplicatePayments ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-foreground" },
            { label: "Duplicate Invoices", value: data?.summary.potentialDuplicateInvoices ?? 0, cls: (data?.summary.potentialDuplicateInvoices ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-foreground" },
            { label: "Duplicate Charges",  value: data?.summary.potentialDuplicateCharges ?? 0,  cls: (data?.summary.potentialDuplicateCharges ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-foreground" },
          ].map(({ label, value, cls }) => (
            <Card key={label}>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── All clear state ── */}
      {allClear && (
        <div className="flex items-center gap-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-4">
          <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-900 dark:text-green-200">No Duplicate Records Detected</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">The system found no potential duplicate payments, invoices, or charges in the current dataset.</p>
          </div>
        </div>
      )}

      {/* ── Engine rule cards ── */}
      {data?.config && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <EngineRuleCard
            icon={<CreditCard className="w-4 h-4" />}
            title="Payments"
            config={data.config.payments}
            count={data.summary.potentialDuplicatePayments}
            colorKey="blue"
          />
          <EngineRuleCard
            icon={<FileText className="w-4 h-4" />}
            title="Invoices"
            config={data.config.invoices}
            count={data.summary.potentialDuplicateInvoices}
            colorKey="green"
          />
          <EngineRuleCard
            icon={<Receipt className="w-4 h-4" />}
            title="Charges"
            config={data.config.charges}
            count={data.summary.potentialDuplicateCharges}
            colorKey="orange"
          />
        </div>
      )}

      {/* ── Detected duplicate pairs ── */}
      {!isLoading && total > 0 && (
        <>
          <Separator />
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold">Detected Duplicate Pairs</h3>
              <p className="text-xs text-muted-foreground">— Review these records and void or reassign as appropriate.</p>
            </div>

            <DuplicatePairTable
              title="Duplicate Payments"
              icon={<CreditCard className="w-4 h-4" />}
              pairs={data?.duplicatePayments ?? []}
              colorKey="blue"
              renderRow={(pair: DupPayment, i: number) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{pair.customer_name}</td>
                  <td className="px-3 py-2 font-medium">{pair.ref1}</td>
                  <td className="px-3 py-2 font-medium">{pair.ref2}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtAmt(pair.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.payment_date)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.date2)}</td>
                </tr>
              )}
            />

            <DuplicatePairTable
              title="Duplicate Invoices"
              icon={<FileText className="w-4 h-4" />}
              pairs={data?.duplicateInvoices ?? []}
              colorKey="green"
              renderRow={(pair: DupInvoice, i: number) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{pair.customer_name}</td>
                  <td className="px-3 py-2 font-medium">{pair.ref1}</td>
                  <td className="px-3 py-2 font-medium">{pair.ref2}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtAmt(pair.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.invoice_date)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.date2)}</td>
                </tr>
              )}
            />

            <DuplicatePairTable
              title="Duplicate Charges"
              icon={<Receipt className="w-4 h-4" />}
              pairs={data?.duplicateCharges ?? []}
              colorKey="orange"
              renderRow={(pair: DupCharge, i: number) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{pair.customer_name}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{pair.desc1 ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{pair.desc2 ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtAmt(pair.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.charge_date)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(pair.date2)}</td>
                </tr>
              )}
            />
          </div>
        </>
      )}

      {/* ── Error messaging guide ── */}
      <Separator />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />Error Code Reference
        </h3>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Error Code</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">HTTP</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Bypassable</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { code: "DUPLICATE_PAYMENT",       type: "Hard", http: "409", bypass: "No",  desc: "Same check number already recorded for this customer." },
                { code: "SOFT_DUPLICATE_PAYMENT",  type: "Soft", http: "409", bypass: "Yes", desc: "Same customer + amount + method within 3 days." },
                { code: "DUPLICATE_INVOICE",       type: "Hard", http: "409", bypass: "No",  desc: "Same customer + reference/PO number on active invoice." },
                { code: "SOFT_DUPLICATE_INVOICE",  type: "Soft", http: "409", bypass: "Yes", desc: "Same customer + amount within ±1 day." },
                { code: "DUPLICATE_CHARGE",        type: "Hard", http: "409", bypass: "No",  desc: "Same source reference ID already exists." },
                { code: "SOFT_DUPLICATE_CHARGE",   type: "Soft", http: "409", bypass: "Yes", desc: "Same customer + similar amount within 3-day window." },
                { code: "CHARGE_ALREADY_EXISTS",   type: "Hard", http: "409", bypass: "No",  desc: "Charge with this source reference/type already created." },
              ].map(({ code, type, http, bypass, desc }) => (
                <tr key={code} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-foreground">{code}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs no-default-active-elevate ${type === "Hard" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono">{http}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs no-default-active-elevate ${bypass === "Yes" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                      {bypass}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
