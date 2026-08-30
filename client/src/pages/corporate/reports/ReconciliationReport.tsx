/**
 * Invoice & DriverReturn Reconciliation Report
 *
 * Ten exception categories surfaced via /api/reconciliation/summary and
 * /api/reconciliation/exceptions.
 */
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertTriangle, ChevronLeft, ChevronRight, RefreshCw,
  Copy, FileWarning, Truck, Link2Off, CalendarOff,
  ReceiptText, FileX, DollarSign, TrendingDown, Wallet,
} from "lucide-react";
import { format } from "date-fns";

// ─── Rule metadata ─────────────────────────────────────────────────────────────

const RULES = [
  {
    key: "duplicate_dr",
    label: "Duplicate DriverReturns",
    icon: Copy,
    color: "red",
    description: "Multiple DriverReturn records sharing the same RedCap ID.",
    severity: "high",
  },
  {
    key: "dr_no_move",
    label: "DR Without Move",
    icon: Link2Off,
    color: "orange",
    description: "DriverReturn records not linked to any Move.",
    severity: "high",
  },
  {
    key: "move_no_dr",
    label: "Move Without DR",
    icon: Truck,
    color: "orange",
    description: "RedCap-imported Moves with no linked DriverReturn.",
    severity: "medium",
  },
  {
    key: "date_mismatch",
    label: "Date Mismatch",
    icon: CalendarOff,
    color: "yellow",
    description: "DriverReturn tripDate differs from its linked Move date.",
    severity: "medium",
  },
  {
    key: "duplicate_charges",
    label: "Duplicate Charges",
    icon: ReceiptText,
    color: "red",
    description: "Multiple billable charges linked to the same trip.",
    severity: "high",
  },
  {
    key: "dr_not_invoiced",
    label: "DR Not Invoiced",
    icon: FileX,
    color: "yellow",
    description: "Completed DriverReturns linked to a Move with no invoiced charge.",
    severity: "medium",
  },
  {
    key: "move_not_invoiced",
    label: "Move Not Invoiced",
    icon: FileWarning,
    color: "yellow",
    description: "Moves with revenue > $0 but no invoiced billable charge.",
    severity: "medium",
  },
  {
    key: "invoice_amount_mismatch",
    label: "Invoice Amount Mismatch",
    icon: DollarSign,
    color: "red",
    description: "Invoice total does not match the sum of its line items.",
    severity: "high",
  },
  {
    key: "revenue_mismatch",
    label: "Revenue Mismatch",
    icon: TrendingDown,
    color: "orange",
    description: "Trip revenue differs from the sum of its billable charges.",
    severity: "medium",
  },
  {
    key: "driver_pay_mismatch",
    label: "Driver Pay Mismatch",
    icon: Wallet,
    color: "orange",
    description: "Trip driverCost and driverPay fields do not match.",
    severity: "medium",
  },
] as const;

type RuleKey = typeof RULES[number]["key"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const $ = (v: any) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dt = (v: any) => (v ? format(new Date(v), "MMM d, yyyy") : "—");

function severityColor(s: string) {
  if (s === "high")   return "bg-red-50    text-red-700    border-red-200";
  if (s === "medium") return "bg-amber-50  text-amber-700  border-amber-200";
  return                     "bg-blue-50   text-blue-700   border-blue-200";
}

function countBadge(n: number) {
  if (n === 0) return <span className="text-xs text-muted-foreground">0</span>;
  return <span className="text-sm font-bold text-red-600">{n.toLocaleString()}</span>;
}

// ─── Summary tile ──────────────────────────────────────────────────────────────

function SummaryTile({
  rule, count, active, onClick,
}: {
  rule: typeof RULES[number];
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = rule.icon;
  return (
    <button
      onClick={onClick}
      className={`
        text-left w-full rounded-lg border p-3 transition-all
        ${active
          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
          : count > 0
            ? `${severityColor(rule.severity)} hover:opacity-90`
            : "border-border bg-card hover:bg-muted/40"
        }
      `}
    >
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${count > 0 ? "" : "text-muted-foreground"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-tight">{rule.label}</p>
          <div className="mt-1">{countBadge(count)}</div>
        </div>
      </div>
    </button>
  );
}

// ─── Column definitions per rule ──────────────────────────────────────────────

function renderRows(rule: RuleKey, rows: any[], onSelect: (r: any) => void) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
          No exceptions found.
        </td>
      </tr>
    );
  }

  switch (rule) {
    case "duplicate_dr":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.redcap_id ?? "—"}</td>
          <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.dealer_name ?? "—"}</td>
          <td className="px-3 py-2 text-right font-medium text-red-600">{r.occurrence_count}</td>
          <td className="px-3 py-2 text-right">{$(r.total_billed)}</td>
        </tr>
      ));

    case "dr_no_move":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.redcap_id ?? "—"}</td>
          <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.dealer_name ?? "—"}</td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
          </td>
          <td className="px-3 py-2 text-right">{$(r.customer_total)}</td>
        </tr>
      ));

    case "move_no_dr":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
          </td>
          <td className="px-3 py-2 text-right">{$(r.revenue)}</td>
          <td className="px-3 py-2 text-right">{$(r.gross_profit)}</td>
        </tr>
      ));

    case "date_mismatch":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.dr_date)}</td>
          <td className="px-3 py-2">{dt(r.move_date)}</td>
          <td className="px-3 py-2 text-center font-medium text-amber-600">
            {r.day_delta != null ? `${r.day_delta > 0 ? "+" : ""}${r.day_delta}d` : "—"}
          </td>
          <td className="px-3 py-2 text-right">{$(r.customer_total)}</td>
        </tr>
      ));

    case "duplicate_charges":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? r.trip_id ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.latest_charge_date)}</td>
          <td className="px-3 py-2 text-center font-medium text-red-600">{r.charge_count}</td>
          <td className="px-3 py-2 text-right">{$(r.total_charged)}</td>
          <td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{r.charge_ids ?? "—"}</td>
        </tr>
      ));

    case "dr_not_invoiced":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.dealer_name ?? "—"}</td>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2 text-right">{$(r.customer_total)}</td>
          <td className="px-3 py-2 text-right">{$(r.trip_revenue)}</td>
        </tr>
      ));

    case "move_not_invoiced":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
          </td>
          <td className="px-3 py-2 text-right">{$(r.revenue)}</td>
          <td className="px-3 py-2 text-right">{$(r.customer_charges)}</td>
        </tr>
      ));

    case "invoice_amount_mismatch":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.invoice_number ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.invoice_date)}</td>
          <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
          </td>
          <td className="px-3 py-2 text-right">{$(r.invoice_total)}</td>
          <td className="px-3 py-2 text-right">{$(r.line_items_total)}</td>
          <td className="px-3 py-2 text-right font-medium text-red-600">{$(r.variance)}</td>
        </tr>
      ));

    case "revenue_mismatch":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
          </td>
          <td className="px-3 py-2 text-right">{$(r.trip_revenue)}</td>
          <td className="px-3 py-2 text-right">{$(r.charged_amount)}</td>
          <td className="px-3 py-2 text-right font-medium text-red-600">{$(r.variance)}</td>
        </tr>
      ));

    case "driver_pay_mismatch":
      return rows.map((r, i) => (
        <tr key={i} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
          <td className="px-3 py-2 font-mono text-xs">{r.move_number ?? "—"}</td>
          <td className="px-3 py-2">{dt(r.trip_date)}</td>
          <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
          <td className="px-3 py-2">{r.customer_name ?? "—"}</td>
          <td className="px-3 py-2 text-right">{$(r.driver_pay)}</td>
          <td className="px-3 py-2 text-right">{$(r.driver_cost)}</td>
          <td className="px-3 py-2 text-right font-medium text-red-600">{$(r.variance)}</td>
        </tr>
      ));

    default:
      return null;
  }
}

function columnHeaders(rule: RuleKey) {
  switch (rule) {
    case "duplicate_dr":
      return ["RedCap ID", "Driver", "Trip Date", "Dealer", "Occurrences", "Total Billed"];
    case "dr_no_move":
      return ["RedCap ID", "Driver", "Trip Date", "Dealer", "Status", "Customer Total"];
    case "move_no_dr":
      return ["Move #", "Trip Date", "Account", "Status", "Revenue", "Gross Profit"];
    case "date_mismatch":
      return ["Move #", "Driver", "DR Date", "Move Date", "Δ Days", "Customer Total"];
    case "duplicate_charges":
      return ["Move #", "Latest Charge Date", "Charge Count", "Total Charged", "Charge IDs"];
    case "dr_not_invoiced":
      return ["Driver", "Trip Date", "Dealer", "Move #", "Customer Total", "Trip Revenue"];
    case "move_not_invoiced":
      return ["Move #", "Trip Date", "Account", "Status", "Revenue", "Cust. Charges"];
    case "invoice_amount_mismatch":
      return ["Invoice #", "Date", "Account", "Status", "Invoice Total", "Line Items Total", "Variance"];
    case "revenue_mismatch":
      return ["Move #", "Trip Date", "Account", "Status", "Trip Revenue", "Charged Amount", "Variance"];
    case "driver_pay_mismatch":
      return ["Move #", "Trip Date", "Driver", "Account", "Driver Pay", "Driver Cost", "Variance"];
    default:
      return [];
  }
}

// ─── Detail sheet ──────────────────────────────────────────────────────────────

function DetailSheet({ rule, row, onClose }: { rule: RuleKey; row: any; onClose: () => void }) {
  if (!row) return null;

  const fields = Object.entries(row)
    .filter(([k]) => k !== "total_count")
    .map(([k, v]) => ({
      label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v !== "")
        ? typeof v === "string" && (k.includes("amount") || k.includes("revenue") || k.includes("pay") || k.includes("cost") || k.includes("billed") || k.includes("total") || k.includes("charged") || k.includes("variance") || k.includes("profit"))
          ? $(v)
          : v
        : v == null ? "—" : String(v),
    }));

  const ruleLabel = RULES.find((r) => r.key === rule)?.label ?? rule;

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {ruleLabel} — Detail
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 border-b pb-2 last:border-0">
              <span className="text-xs text-muted-foreground w-40 shrink-0">{label}</span>
              <span className="text-xs font-medium text-right break-all">{String(value)}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ReconciliationReport() {
  // Default: last 90 days
  const today     = new Date();
  const minus90   = new Date(today);
  minus90.setDate(today.getDate() - 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(fmt(minus90));
  const [dateTo,   setDateTo]   = useState(fmt(today));
  const [activeRule, setActiveRule] = useState<RuleKey>("duplicate_dr");
  const [page, setPage]  = useState(1);
  const [selected, setSelected] = useState<any>(null);

  const summaryParams = new URLSearchParams({ dateFrom, dateTo }).toString();
  const exParams      = new URLSearchParams({ rule: activeRule, dateFrom, dateTo, page: String(page), limit: "50" }).toString();

  const { data: summary, isLoading: sumLoading, refetch: refetchSum } = useQuery({
    queryKey: ["reconciliation", "summary", dateFrom, dateTo],
    queryFn: () => apiRequest("GET", `/api/reconciliation/summary?${summaryParams}`).then((r) => r.json()),
  });

  const { data: exceptions, isLoading: exLoading } = useQuery({
    queryKey: ["reconciliation", "exceptions", activeRule, dateFrom, dateTo, page],
    queryFn: () => apiRequest("GET", `/api/reconciliation/exceptions?${exParams}`).then((r) => r.json()),
    placeholderData: (prev) => prev,
  });

  const counts: Record<string, number> = summary?.rules ?? {};
  const totalExceptions = Object.values(counts).reduce((a, b) => a + b, 0);

  const handleRuleSelect = useCallback((key: RuleKey) => {
    setActiveRule(key);
    setPage(1);
    setSelected(null);
  }, []);

  const activeRuleMeta = RULES.find((r) => r.key === activeRule)!;
  const rows   = exceptions?.data ?? [];
  const total  = exceptions?.total ?? 0;
  const pages  = Math.max(1, Math.ceil(total / 50));
  const cols   = columnHeaders(activeRule);

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice & DriverReturn Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Exception report — identify billing, invoicing, and data integrity issues.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm" />
          <Button variant="outline" size="sm" onClick={() => refetchSum()} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Total banner */}
      {!sumLoading && (
        <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${totalExceptions > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <AlertTriangle className={`h-5 w-5 shrink-0 ${totalExceptions > 0 ? "text-red-500" : "text-green-500"}`} />
          <div>
            <span className={`font-semibold ${totalExceptions > 0 ? "text-red-700" : "text-green-700"}`}>
              {totalExceptions > 0
                ? `${totalExceptions.toLocaleString()} exception${totalExceptions === 1 ? "" : "s"} found across ${Object.values(counts).filter((c) => c > 0).length} rule${Object.values(counts).filter((c) => c > 0).length === 1 ? "" : "s"}`
                : "No exceptions — all reconciliation checks passed"}
            </span>
            <p className={`text-xs mt-0.5 ${totalExceptions > 0 ? "text-red-600" : "text-green-600"}`}>
              Period: {dt(dateFrom)} – {dt(dateTo)}
            </p>
          </div>
        </div>
      )}

      {/* Rule tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {RULES.map((rule) => (
          <SummaryTile
            key={rule.key}
            rule={rule}
            count={sumLoading ? 0 : (counts[rule.key] ?? 0)}
            active={activeRule === rule.key}
            onClick={() => handleRuleSelect(rule.key)}
          />
        ))}
      </div>

      {/* Exception table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <activeRuleMeta.icon className="h-4 w-4" />
                {activeRuleMeta.label}
                {!sumLoading && counts[activeRule] != null && (
                  <Badge variant={counts[activeRule] > 0 ? "destructive" : "secondary"} className="ml-1">
                    {counts[activeRule].toLocaleString()}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{activeRuleMeta.description}</p>
            </div>
            {total > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{((page - 1) * 50 + 1).toLocaleString()}–{Math.min(page * 50, total).toLocaleString()} of {total.toLocaleString()}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {cols.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {cols.map((c) => (
                          <td key={c} className="px-3 py-2">
                            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : renderRows(activeRule, rows, setSelected)}
              </tbody>
            </table>
          </div>

          {/* Bottom pagination */}
          {!exLoading && total > 50 && (
            <div className="flex justify-center gap-2 py-3 border-t">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground self-center">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      {selected && (
        <DetailSheet rule={activeRule} row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
