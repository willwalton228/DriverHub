import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Download, CheckCircle2, XCircle, AlertTriangle, Clock,
  Car, DollarSign, TrendingUp, BarChart3, ExternalLink, RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReportSummary {
  totalRides: number;
  totalSpend: string;
  matchedRides: number;
  exceptionRides: number;
  matchPct: number;
  exceptionPct: number;
  billedPct: number;
  avgFare: string | null;
  uberSpend: string;
  lyftSpend: string;
  uberRides: number;
  lyftRides: number;
}

interface ReportTransaction {
  id: string;
  provider: string;
  rideDate: string | null;
  rideDatetime: string | null;
  riderName: string | null;
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
  matchedAccountId: string | null;
  matchedAccountNumber: string | null;
  matchedAccountName: string | null;
  totalFare: string | null;
  matchStatus: string;
  matchMethod: string | null;
  matchConfidence: string | null;
  billingStatus: string;
  exceptionReason: string | null;
  importBatchId: string | null;
  batchFileName: string | null;
}

interface ImportBatch {
  id: string;
  provider: string;
  sourceFileName: string;
  uploadedAt: string | null;
  totalRows: number | null;
  matchedRows: number | null;
  exceptionRows: number | null;
}

interface TransactionDetail {
  transaction: Record<string, any>;
  rawRow: { rawRowJson: Record<string, any>; rowNumber: number } | null;
  batch: ImportBatch | null;
  matchedAccount: {
    id: string;
    customerNumber: string | null;
    companyName: string | null;
    customerAddress: string | null;
    customerCity: string | null;
  } | null;
}

interface Props {
  dateFrom: string;
  dateTo: string;
  provider: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge className={provider === "uber" ? "bg-black text-white text-xs" : "bg-pink-600 text-white text-xs"}>
      {provider === "uber" ? "Uber" : "Lyft"}
    </Badge>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  if (status === "auto_matched" || status === "matched") {
    return <Badge className="bg-green-600 text-white gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Matched</Badge>;
  }
  if (status === "manual_matched") {
    return <Badge className="bg-teal-600 text-white gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Manual</Badge>;
  }
  if (status === "exception") {
    return <Badge variant="outline" className="gap-1 text-xs border-yellow-500 text-yellow-600 dark:text-yellow-400"><AlertTriangle className="h-3 w-3" />Exception</Badge>;
  }
  return <Badge variant="outline" className="gap-1 text-xs border-orange-500 text-orange-600 dark:text-orange-400"><XCircle className="h-3 w-3" />Unmatched</Badge>;
}

function BillingStatusBadge({ status }: { status: string }) {
  if (status === "billed") return <Badge className="bg-green-700 text-white text-xs">Billed</Badge>;
  if (status === "ready_for_billing") return <Badge className="bg-blue-600 text-white text-xs">Ready</Badge>;
  if (status === "excluded") return <Badge variant="secondary" className="text-xs">Excluded</Badge>;
  if (status === "needs_followup") return <Badge className="bg-blue-500 text-white gap-1 text-xs"><Clock className="h-3 w-3" />Follow-up</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Unreviewed</Badge>;
}

function fmtDatetime(dt: string | null, fallback: string | null) {
  const s = dt || fallback;
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

// ─── Drilldown Detail Sheet ─────────────────────────────────────────────────────

function DetailSheet({
  txId,
  open,
  onClose,
}: {
  txId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<TransactionDetail>({
    queryKey: ["/api/corporate/rideshare/transactions/detail", txId],
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/${txId}/detail`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!txId && open,
  });

  const tx = data?.transaction;
  const rawRow = data?.rawRow;
  const batch = data?.batch;
  const account = data?.matchedAccount;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-muted-foreground" />
            Ride Detail
          </SheetTitle>
          <SheetDescription>
            Full normalized record, raw source data, and match information
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !tx ? (
          <p className="text-muted-foreground text-sm">No data found.</p>
        ) : (
          <div className="space-y-6">
            {/* ── Normalized Fields ─────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Normalized Fields</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailRow label="Provider"><ProviderBadge provider={tx.provider} /></DetailRow>
                <DetailRow label="Ride Date">{fmtDatetime(tx.rideDatetime, tx.rideDate)}</DetailRow>
                <DetailRow label="Rider">{tx.riderName || "—"}</DetailRow>
                <DetailRow label="Trip ID">{tx.providerTripId || "—"}</DetailRow>
                <DetailRow label="Pickup" wide>{tx.pickupAddressRaw || "—"}</DetailRow>
                <DetailRow label="Dropoff" wide>{tx.dropoffAddressRaw || "—"}</DetailRow>
                <DetailRow label="Total Fare">{fmt$(tx.totalFare)}</DetailRow>
                <DetailRow label="Base Fare">{fmt$(tx.baseFare)}</DetailRow>
                <DetailRow label="Tip">{fmt$(tx.tips)}</DetailRow>
                <DetailRow label="Distance">{tx.distanceMiles ? `${tx.distanceMiles} mi` : "—"}</DetailRow>
                <DetailRow label="Duration">{tx.durationMinutes ? `${tx.durationMinutes} min` : "—"}</DetailRow>
                <DetailRow label="Ride Type">{tx.serviceType || tx.rideType || "—"}</DetailRow>
                <DetailRow label="City/State">{[tx.city, tx.state].filter(Boolean).join(", ") || "—"}</DetailRow>
              </div>
            </div>

            <Separator />

            {/* ── Match & Account Info ───────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Match & Account</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailRow label="Match Status"><MatchStatusBadge status={tx.matchStatus} /></DetailRow>
                <DetailRow label="Billing Status"><BillingStatusBadge status={tx.billingStatus} /></DetailRow>
                <DetailRow label="Match Method">{tx.matchMethod || "—"}</DetailRow>
                <DetailRow label="Confidence">{tx.matchConfidence ? `${(parseFloat(tx.matchConfidence) * 100).toFixed(0)}%` : "—"}</DetailRow>
                {account && (
                  <>
                    <DetailRow label="Account Name">{account.companyName || "—"}</DetailRow>
                    <DetailRow label="Account #">{account.customerNumber || "—"}</DetailRow>
                    <DetailRow label="Account Address" wide>
                      {[account.customerAddress, account.customerCity].filter(Boolean).join(", ") || "—"}
                    </DetailRow>
                  </>
                )}
                {tx.exceptionReason && (
                  <DetailRow label="Exception Reason" wide>
                    <span className="text-yellow-700 dark:text-yellow-400">{tx.exceptionReason}</span>
                  </DetailRow>
                )}
              </div>
            </div>

            <Separator />

            {/* ── Import Batch Metadata ─────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Import Batch</h3>
              {!batch ? (
                <p className="text-sm text-muted-foreground">No batch metadata available.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <DetailRow label="File" wide>{batch.sourceFileName}</DetailRow>
                  <DetailRow label="Provider"><ProviderBadge provider={batch.provider} /></DetailRow>
                  <DetailRow label="Uploaded">{batch.uploadedAt ? formatDate(batch.uploadedAt) : "—"}</DetailRow>
                  <DetailRow label="Total Rows">{batch.totalRows?.toLocaleString() || "—"}</DetailRow>
                  <DetailRow label="Matched">{batch.matchedRows?.toLocaleString() || "—"}</DetailRow>
                  <DetailRow label="Exceptions">{batch.exceptionRows?.toLocaleString() || "—"}</DetailRow>
                  {rawRow && <DetailRow label="Row #">{rawRow.rowNumber}</DetailRow>}
                </div>
              )}
            </div>

            {/* ── Raw Row JSON ──────────────────────────────────────── */}
            {rawRow?.rawRowJson && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Raw Source Data
                    <span className="text-xs font-normal normal-case ml-1.5 text-muted-foreground">
                      (unmodified — row {rawRow.rowNumber})
                    </span>
                  </h3>
                  <div className="rounded-md bg-muted/50 border p-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(rawRow.rawRowJson).map(([k, v]) => (
                          <tr key={k} className="border-b last:border-0">
                            <td className="py-1 pr-3 font-medium text-muted-foreground align-top whitespace-nowrap">{k}</td>
                            <td className="py-1 pl-1 break-words max-w-xs">{String(v ?? "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return wide ? (
    <div className="col-span-2">
      <span className="text-muted-foreground">{label}: </span>
      <span>{children}</span>
    </div>
  ) : (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{children}</span>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KPI({
  label, value, sub, icon: Icon, highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  highlight?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={`text-xl font-bold mt-0.5 truncate ${highlight || ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function RideshareReportView({ dateFrom, dateTo, provider }: Props) {
  const LIMIT = 100;

  // Internal filters (refinements within the report)
  const [matchStatus,   setMatchStatus]   = useState("__all__");
  const [billingStatus, setBillingStatus] = useState("__all__");
  const [accountNumber, setAccountNumber] = useState("");
  const [importBatchId, setImportBatchId] = useState("__all__");
  const [offset,        setOffset]        = useState(0);

  // Drilldown
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openDetail = (id: string) => { setDetailId(id); setSheetOpen(true); };

  // Build params
  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (dateFrom)                        params.set("dateFrom", dateFrom);
  if (dateTo)                          params.set("dateTo",   dateTo);
  if (provider && provider !== "__all__") params.set("provider", provider);
  if (matchStatus !== "__all__")       params.set("matchStatus", matchStatus);
  if (billingStatus !== "__all__")     params.set("billingStatus", billingStatus);
  if (accountNumber.trim())            params.set("accountNumber", accountNumber.trim());
  if (importBatchId !== "__all__")     params.set("importBatchId", importBatchId);

  const queryKey = [
    "/api/corporate/rideshare/transactions/report",
    dateFrom, dateTo, provider,
    matchStatus, billingStatus, accountNumber, importBatchId, offset,
  ];

  const { data, isLoading, refetch } = useQuery<{
    summary: ReportSummary;
    transactions: ReportTransaction[];
    total: number;
  }>({
    queryKey,
    queryFn: () =>
      fetch(`/api/corporate/rideshare/transactions/report?${params}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const { data: batches = [] } = useQuery<ImportBatch[]>({
    queryKey: ["/api/corporate/rideshare/transactions/import-batches-list"],
    queryFn: () =>
      fetch("/api/corporate/rideshare/transactions/import-batches-list", { credentials: "include" })
        .then(r => r.json()),
  });

  const summary = data?.summary;
  const transactions = data?.transactions || [];
  const total = data?.total || 0;

  const hasFilters = matchStatus !== "__all__" || billingStatus !== "__all__" || !!accountNumber.trim() || importBatchId !== "__all__";

  const resetFilters = () => {
    setMatchStatus("__all__");
    setBillingStatus("__all__");
    setAccountNumber("");
    setImportBatchId("__all__");
    setOffset(0);
  };

  const handleExportCSV = () => {
    const headers = [
      "Date/Time", "Provider", "Rider", "Pickup", "Dropoff",
      "Acct #", "Account", "Fare", "Match Status", "Billing Status", "Import File",
    ];
    const rows = transactions.map(t => [
      fmtDatetime(t.rideDatetime, t.rideDate),
      t.provider,
      t.riderName || "",
      t.pickupAddressRaw || "",
      t.dropoffAddressRaw || "",
      t.matchedAccountNumber || "",
      t.matchedAccountName || "",
      t.totalFare ? `$${parseFloat(t.totalFare).toFixed(2)}` : "",
      t.matchStatus,
      t.billingStatus,
      t.batchFileName || "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

    const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rideshare_reconciliation_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  return (
    <>
      <div className="space-y-4">
        {/* ── Summary Metrics ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPI
            label="Total Rides"
            value={isLoading ? "—" : (summary?.totalRides ?? 0).toLocaleString()}
            icon={Car}
          />
          <KPI
            label="Total Spend"
            value={isLoading ? "—" : fmt$(summary?.totalSpend)}
            sub={isLoading ? undefined : `Avg ${fmt$(summary?.avgFare)}`}
            icon={DollarSign}
          />
          <KPI
            label="Matched"
            value={isLoading ? "—" : (summary?.matchedRides ?? 0).toLocaleString()}
            sub={isLoading ? undefined : pct(summary?.matchPct ?? 0)}
            icon={CheckCircle2}
            highlight={!isLoading && (summary?.matchPct ?? 0) >= 80 ? "text-green-600" : ""}
          />
          <KPI
            label="Exceptions"
            value={isLoading ? "—" : (summary?.exceptionRides ?? 0).toLocaleString()}
            sub={isLoading ? undefined : pct(summary?.exceptionPct ?? 0)}
            icon={AlertTriangle}
            highlight={!isLoading && (summary?.exceptionRides ?? 0) > 0 ? "text-yellow-600" : ""}
          />
          <KPI
            label="Billed / Ready"
            value={isLoading ? "—" : pct(summary?.billedPct ?? 0)}
            icon={BarChart3}
          />
        </div>

        {/* Provider spend breakdown + extra KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Spend by Provider</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : !summary || summary.totalRides === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <>
                  <div className="flex rounded-md overflow-hidden h-4">
                    {summary.uberRides > 0 && (
                      <div
                        className="bg-black"
                        style={{ width: `${(summary.uberRides / summary.totalRides) * 100}%` }}
                        title={`Uber: ${summary.uberRides} rides · ${fmt$(summary.uberSpend)}`}
                      />
                    )}
                    {summary.lyftRides > 0 && (
                      <div
                        className="bg-pink-600"
                        style={{ width: `${(summary.lyftRides / summary.totalRides) * 100}%` }}
                        title={`Lyft: ${summary.lyftRides} rides · ${fmt$(summary.lyftSpend)}`}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm bg-black inline-block mt-1 shrink-0" />
                      <div>
                        <p className="font-medium">Uber</p>
                        <p className="text-muted-foreground text-xs">{summary.uberRides.toLocaleString()} rides · {fmt$(summary.uberSpend)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm bg-pink-600 inline-block mt-1 shrink-0" />
                      <div>
                        <p className="font-medium">Lyft</p>
                        <p className="text-muted-foreground text-xs">{summary.lyftRides.toLocaleString()} rides · {fmt$(summary.lyftSpend)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Match Rate Overview</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : !summary || summary.totalRides === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <>
                  <div className="flex rounded-md overflow-hidden h-4">
                    {summary.matchedRides > 0 && (
                      <div
                        className="bg-green-600"
                        style={{ width: `${summary.matchPct}%` }}
                        title={`Matched: ${summary.matchedRides}`}
                      />
                    )}
                    {summary.exceptionRides > 0 && (
                      <div
                        className="bg-yellow-500"
                        style={{ width: `${summary.exceptionPct}%` }}
                        title={`Exceptions: ${summary.exceptionRides}`}
                      />
                    )}
                    {summary.totalRides - summary.matchedRides - summary.exceptionRides > 0 && (
                      <div className="flex-1 bg-muted" />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-green-600 font-medium">{pct(summary.matchPct)}</p>
                      <p className="text-muted-foreground">Matched</p>
                    </div>
                    <div>
                      <p className="text-yellow-600 font-medium">{pct(summary.exceptionPct)}</p>
                      <p className="text-muted-foreground">Exceptions</p>
                    </div>
                    <div>
                      <p className="font-medium"><TrendingUp className="h-3 w-3 inline mr-0.5" />{pct(summary.billedPct)}</p>
                      <p className="text-muted-foreground">Billed/Ready</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Data Grid ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  Ride Transactions
                  {!isLoading && (
                    <Badge variant="secondary" className="text-xs">{total.toLocaleString()} rows</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-0.5">
                  {dateFrom && dateTo
                    ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
                    : "All dates"}
                  {provider && provider !== "__all__" ? ` · ${provider === "uber" ? "Uber" : "Lyft"} only` : ""}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-report-filters">
                    Clear filters
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-report">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={transactions.length === 0}
                  data-testid="button-export-report-csv"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Select value={matchStatus} onValueChange={(v) => { setMatchStatus(v); setOffset(0); }}>
                <SelectTrigger className="w-40" data-testid="select-report-match-status">
                  <SelectValue placeholder="All match statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Match Statuses</SelectItem>
                  <SelectItem value="auto_matched">Auto Matched</SelectItem>
                  <SelectItem value="manual_matched">Manual Match</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                </SelectContent>
              </Select>

              <Select value={billingStatus} onValueChange={(v) => { setBillingStatus(v); setOffset(0); }}>
                <SelectTrigger className="w-40" data-testid="select-report-billing-status">
                  <SelectValue placeholder="All billing statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Billing Statuses</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed</SelectItem>
                  <SelectItem value="ready_for_billing">Ready for Billing</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                  <SelectItem value="excluded">Excluded</SelectItem>
                  <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Acct #</Label>
                <Input
                  placeholder="Account number…"
                  value={accountNumber}
                  onChange={(e) => { setAccountNumber(e.target.value); setOffset(0); }}
                  className="w-36 text-sm"
                  data-testid="input-report-account-number"
                />
              </div>

              <Select value={importBatchId} onValueChange={(v) => { setImportBatchId(v); setOffset(0); }}>
                <SelectTrigger className="w-48" data-testid="select-report-import-batch">
                  <SelectValue placeholder="All import batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Import Batches</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.sourceFileName.length > 30
                        ? `…${b.sourceFileName.slice(-28)}`
                        : b.sourceFileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="border-t overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Date / Time</TableHead>
                    <TableHead className="w-16">Provider</TableHead>
                    <TableHead>Rider</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Dropoff</TableHead>
                    <TableHead className="w-24">Acct #</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-20 text-right">Fare</TableHead>
                    <TableHead className="w-28">Match</TableHead>
                    <TableHead className="w-28">Billing</TableHead>
                    <TableHead>Import File</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                        No transactions found for the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => openDetail(tx.id)}
                        data-testid={`row-report-tx-${tx.id}`}
                      >
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {fmtDatetime(tx.rideDatetime, tx.rideDate)}
                        </TableCell>
                        <TableCell><ProviderBadge provider={tx.provider} /></TableCell>
                        <TableCell className="text-sm">{tx.riderName || "—"}</TableCell>
                        <TableCell className="text-sm max-w-36 truncate" title={tx.pickupAddressRaw || undefined}>
                          {tx.pickupAddressRaw || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-36 truncate" title={tx.dropoffAddressRaw || undefined}>
                          {tx.dropoffAddressRaw || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{tx.matchedAccountNumber || "—"}</TableCell>
                        <TableCell className="text-sm max-w-40 truncate" title={tx.matchedAccountName || undefined}>
                          {tx.matchedAccountName || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-right">{fmt$(tx.totalFare)}</TableCell>
                        <TableCell><MatchStatusBadge status={tx.matchStatus} /></TableCell>
                        <TableCell><BillingStatusBadge status={tx.billingStatus} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-32 truncate" title={tx.batchFileName || undefined}>
                          {tx.batchFileName || "—"}
                        </TableCell>
                        <TableCell className="p-2">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    data-testid="button-report-prev">
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                    data-testid="button-report-next">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DetailSheet txId={detailId} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
