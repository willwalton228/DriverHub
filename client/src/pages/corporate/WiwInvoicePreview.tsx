/**
 * WIW Shift Invoice Preview — Rebuilt
 *
 * BILLING LOGIC: Independent Contractors — straight time only.
 * ALL hours billed at the contracted rate. NO overtime.
 * Bill Amount = Total Hours × Bill Rate  (one row per driver per date)
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle2, Info, Search, FileText, Clock,
  DollarSign, User, Calendar, ExternalLink, RefreshCw,
  Download, Printer, Building2,
} from "lucide-react";
import logoUrl from "@/assets/dod-logo.png";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ACCOUNT_ID  = "9af8bd24-e163-4382-9472-f9418c43ec77";
const DEFAULT_START       = "2026-04-13";
const DEFAULT_END         = "2026-04-17";
const DEFAULT_WEEK_ENDING = "2026-04-19";
const DEALER_ID           = "9917";
const BRAND_BLUE          = "#0067B8";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Flag {
  type: "error" | "warning" | "info";
  code: string;
  message: string;
}

interface ShiftRow {
  shiftId: string;
  date: string;
  dateISO: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledHrs: number;
  clockIn: string | null;
  clockOut: string | null;
  billableHrs: number;   // straight time only
  approvalStatus: string | null;
  hasTimeRecord: boolean;
  driverName: string;
  employeeCode: string | null;
  positionName: string;
  locationName: string;
}

interface PreviewData {
  account: { id: string; name: string; number: string; status: string };
  locationMaps: { wiwLocationId: string; wiwLocationName: string; mappingStatus: string; locationName?: string }[];
  shifts: ShiftRow[];
  flags: Flag[];
  configuredBillRate: number | null;
  hasConfiguredRate: boolean;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function FlagAlert({ flag }: { flag: Flag }) {
  const icon = flag.type === "error"
    ? <AlertTriangle className="h-4 w-4" />
    : flag.type === "warning"
    ? <AlertTriangle className="h-4 w-4" />
    : <Info className="h-4 w-4" />;
  const variant = flag.type === "error" ? "destructive" : "default";
  return (
    <Alert variant={variant} className={
      flag.type === "warning" ? "border-yellow-500/40 bg-yellow-500/5" :
      flag.type === "info"    ? "border-blue-500/40 bg-blue-500/5" : ""}>
      {icon}
      <AlertTitle className="text-sm font-medium capitalize">{flag.type}</AlertTitle>
      <AlertDescription className="text-sm">{flag.message}</AlertDescription>
    </Alert>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status)                return <Badge variant="outline"    className="text-xs">No Record</Badge>;
  if (status === "approved")  return <Badge className="text-xs bg-green-600 hover:bg-green-600">Approved</Badge>;
  return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">{status}</Badge>;
}

// ── Invoice Preview (printable area) ─────────────────────────────────────────

interface InvoicePreviewProps {
  data: PreviewData;
  billRate: number;
  weekEnding: string;
  invoiceNumber?: string;
}

function InvoicePreview({ data, billRate, weekEnding, invoiceNumber }: InvoicePreviewProps) {
  const invoiceDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const dueDate     = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const weekEnd     = weekEnding
    ? new Date(weekEnding + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : weekEnding;

  const sorted = useMemo(() => [...data.shifts].sort((a, b) => {
    const d = (a.dateISO || a.date).localeCompare(b.dateISO || b.date);
    return d !== 0 ? d : a.driverName.localeCompare(b.driverName);
  }), [data.shifts]);

  const rows = sorted.map((s) => ({
    ...s,
    startTime:  s.clockIn ?? s.scheduledStart,
    endTime:    s.clockOut ?? s.scheduledEnd,
    billAmount: Math.round(s.billableHrs * billRate * 100) / 100,
  }));

  const grandTotal = rows.reduce((sum, r) => sum + r.billAmount, 0);
  const totalHours = rows.reduce((sum, r) => sum + r.billableHrs, 0);

  // Group by date for subtotals
  const byDate: Record<string, typeof rows> = {};
  for (const r of rows) {
    const key = r.dateISO || r.date;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r);
  }

  return (
    <div
      id="invoice-preview"
      className="bg-white text-[#1B1B1B] font-['Segoe_UI',Helvetica,Arial,sans-serif] text-sm leading-snug"
      style={{ fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}
    >
      {/* Header */}
      <div style={{ borderBottom: `3px solid ${BRAND_BLUE}`, paddingBottom: 20, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <img src={logoUrl} alt="Driver on Demand" style={{ maxHeight: 68, maxWidth: 220, objectFit: "contain" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: BRAND_BLUE, letterSpacing: 2, textTransform: "uppercase" }}>Invoice</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#444", lineHeight: 1.7 }}>
            <div><strong>Invoice #</strong> {invoiceNumber ?? "DRAFT"}</div>
            <div><strong>Invoice Date</strong> {invoiceDate}</div>
            <div><strong>Due Date</strong> {dueDate}</div>
            <div><strong>Terms</strong> Net 30</div>
          </div>
        </div>
      </div>

      {/* Bill To / From */}
      <div style={{ display: "flex", gap: 32, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: BRAND_BLUE, marginBottom: 5, paddingBottom: 3, borderBottom: `1px solid ${BRAND_BLUE}` }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{data.account.name}</div>
          <div style={{ display: "inline-block", background: BRAND_BLUE, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3, marginTop: 4 }}>
            Dealer ID: {DEALER_ID}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: BRAND_BLUE, marginBottom: 5, paddingBottom: 3, borderBottom: `1px solid ${BRAND_BLUE}` }}>Bill From</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Driver on Demand</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
            Transportation Staffing Solutions<br />
            accounts@driverondemand.co
          </div>
        </div>
      </div>

      {/* Period banner */}
      <div style={{ background: "#f0f5fb", borderLeft: `4px solid ${BRAND_BLUE}`, padding: "8px 14px", marginBottom: 18, borderRadius: "0 4px 4px 0", fontSize: 12 }}>
        <strong style={{ color: BRAND_BLUE }}>Billing Period:</strong> Services rendered for the week ending <strong>{weekEnd}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong style={{ color: BRAND_BLUE }}>Rate Type:</strong> Straight Time&nbsp;
        <span style={{ background: "#fff3cd", color: "#856404", border: "1px solid #ffc107", borderRadius: 3, fontSize: 10, fontWeight: 700, padding: "1px 5px" }}>IC</span>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong style={{ color: BRAND_BLUE }}>Bill Rate:</strong> {fmt(billRate)}/hr
      </div>

      {/* Line items table */}
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
          <thead>
            <tr style={{ background: BRAND_BLUE, color: "#fff" }}>
              {["Shift Date", "Position", "Driver Name", "Start Time", "End Time", "Bill Rate", "Total Hours", "Bill Amount"].map((h, i) => (
                <th key={h} style={{ padding: "7px 8px", textAlign: i >= 5 ? "right" : "left", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(byDate).map(([dateKey, dayRows]) => (
              <>
                {dayRows.map((row, ri) => (
                  <tr key={row.shiftId} style={{ background: ri % 2 === 0 ? "#f7f9fc" : "#fff", borderBottom: "1px solid #e8ecf0" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{row.date}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{row.positionName}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{row.driverName}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.startTime}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.endTime}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(billRate)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.billableHrs.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(row.billAmount)}</td>
                  </tr>
                ))}
                {/* Daily subtotal */}
                <tr style={{ background: "#dce8f5", borderTop: "1px solid #b3cde8", borderBottom: `2px solid ${BRAND_BLUE}` }}>
                  <td colSpan={6} style={{ padding: "5px 8px", fontWeight: 600, color: "#003d7a", fontStyle: "italic" }}>
                    Daily Total — {dayRows[0].date}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#003d7a", fontVariantNumeric: "tabular-nums" }}>
                    {dayRows.reduce((s, r) => s + r.billableHrs, 0).toFixed(2)}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#003d7a", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(dayRows.reduce((s, r) => s + r.billAmount, 0))}
                  </td>
                </tr>
              </>
            ))}
            {/* Grand total row */}
            <tr style={{ background: "#e8f0f8", borderTop: `2px solid ${BRAND_BLUE}` }}>
              <td colSpan={6} style={{ padding: "8px", fontWeight: 700, color: "#003d7a" }}>Grand Total</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#003d7a", fontVariantNumeric: "tabular-nums" }}>{totalHours.toFixed(2)}</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, fontSize: 14, color: "#003d7a", fontVariantNumeric: "tabular-nums" }}>{fmt(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals box */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
        <div style={{ width: 280, border: "1px solid #c5d8ed", borderRadius: 4, overflow: "hidden" }}>
          {[
            { label: "Total Hours", val: `${totalHours.toFixed(2)} hrs` },
            { label: "Bill Rate",   val: `${fmt(billRate)}/hr` },
            { label: "Subtotal",    val: fmt(grandTotal) },
          ].map(({ label, val }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", fontSize: 12, borderBottom: "1px solid #e0ecf7" }}>
              <span>{label}</span><span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{val}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: BRAND_BLUE, color: "#fff", fontSize: 13, fontWeight: 700 }}>
            <span>Amount Due</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: `2px solid ${BRAND_BLUE}`, paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
        <div style={{ maxWidth: "60%", lineHeight: 1.5 }}>
          All workers on this invoice are Independent Contractors (ICs). Hours are billed at straight time only — no overtime applies.
          Please remit payment within 30 days. Questions? accounts@driverondemand.co
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE, marginBottom: 2 }}>Thank you for your business!</div>
          <div>Driver on Demand</div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WiwInvoicePreview() {
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const [accountId,   setAccountId]   = useState(DEFAULT_ACCOUNT_ID);
  const [startDate,   setStartDate]   = useState(DEFAULT_START);
  const [endDate,     setEndDate]     = useState(DEFAULT_END);
  const [weekEnding,  setWeekEnding]  = useState(DEFAULT_WEEK_ENDING);
  const [billRate,    setBillRate]    = useState("");
  const [notes,       setNotes]       = useState("");
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const [queryParams, setQueryParams] = useState<{ accountId: string; startDate: string; endDate: string } | null>(
    { accountId: DEFAULT_ACCOUNT_ID, startDate: DEFAULT_START, endDate: DEFAULT_END }
  );

  const { data, isLoading, error, refetch } = useQuery<PreviewData>({
    queryKey: ["/api/billing/wiw-invoice-preview", queryParams?.accountId, queryParams?.startDate, queryParams?.endDate],
    queryFn: async () => {
      if (!queryParams) throw new Error("No params");
      const p = new URLSearchParams({ accountId: queryParams.accountId, startDate: queryParams.startDate, endDate: queryParams.endDate });
      const res = await fetch(`/api/billing/wiw-invoice-preview?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!queryParams,
  });

  // Auto-populate bill rate from configured rate
  useEffect(() => {
    if (data?.configuredBillRate && !billRate) {
      setBillRate(String(data.configuredBillRate));
    }
  }, [data?.configuredBillRate]);

  // Generate draft invoice mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/wiw-invoice-preview/generate", {
        accountId,
        startDate,
        endDate,
        weekEnding,
        billRate: Number(billRate),
        dealerId: DEALER_ID,
        notes:    notes || undefined,
        includeOnlyApproved: false,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title:       "Draft Invoice Created",
        description: `${result.invoiceNumber} created for ${fmt(result.subtotal ?? 0)} — ${result.lineCount} line items.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to generate", description: err.message, variant: "destructive" });
    },
  });

  // PDF download
  const handleDownloadPdf = async () => {
    if (!billRate || !queryParams) return;
    setIsPdfLoading(true);
    try {
      const p = new URLSearchParams({
        accountId: queryParams.accountId,
        startDate: queryParams.startDate,
        endDate:   queryParams.endDate,
        billRate,
        weekEnding,
        dealerId:  DEALER_ID,
      });
      const res = await fetch(`/api/billing/wiw-invoice-preview/pdf?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `shift-invoice-${startDate}-to-${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "PDF Downloaded", description: "Shift invoice PDF saved." });
    } catch (err: any) {
      toast({ title: "PDF Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPdfLoading(false);
    }
  };

  // Print
  const handlePrint = () => {
    const el = document.getElementById("invoice-preview");
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Shift Invoice</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1B1B1B; padding: 32px 40px; }
        @media print { body { padding: 20px; } }
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const effectiveRate   = Number(billRate) || data?.configuredBillRate || 0;
  const grandTotal      = effectiveRate > 0 ? (data?.shifts ?? []).reduce((s, r) => s + Math.round(r.billableHrs * effectiveRate * 100) / 100, 0) : 0;
  const totalHours      = (data?.shifts ?? []).reduce((s, r) => s + r.billableHrs, 0);
  const canGenerate     = effectiveRate > 0 && (data?.shifts ?? []).length > 0 && !generateMutation.isSuccess;
  const canPdf          = effectiveRate > 0 && (data?.shifts ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-2xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WIW Shift Invoice Preview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generates a date-itemized shift invoice from live WIW data. Straight time only — ICs, no overtime.
          </p>
        </div>
        {generateMutation.isSuccess && (
          <Button variant="outline" onClick={() => navigate("/invoices")} data-testid="button-go-to-invoices">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Invoices
          </Button>
        )}
      </div>

      {/* ── Parameters card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Source Parameters</CardTitle>
          <CardDescription>Account and date range to pull WIW shift data.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="accountId">Account ID</Label>
              <Input id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="DriverHub account UUID" data-testid="input-account-id" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => setQueryParams({ accountId, startDate, endDate })} disabled={isLoading} data-testid="button-load-data">
              {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Load Shifts
            </Button>
            {data && (
              <Button variant="outline" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load data</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* ── Summary stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2"><User className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Account</p>
                    <p className="font-medium text-sm leading-tight">{data.account.name}</p>
                    <p className="text-xs text-muted-foreground">#{data.account.number}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2"><Building2 className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dealer ID</p>
                    <p className="font-semibold text-base">{DEALER_ID}</p>
                    <p className="text-xs text-muted-foreground">Bill Knight Ford</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2"><Clock className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Shifts / Hours</p>
                    <p className="font-medium text-sm">{data.shifts.length} shifts</p>
                    <p className="text-xs text-muted-foreground">{totalHours.toFixed(2)} billable hrs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2"><DollarSign className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice Total</p>
                    <p className="font-semibold text-base">{effectiveRate > 0 ? fmt(grandTotal) : "—"}</p>
                    <p className="text-xs text-muted-foreground">straight time only</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Flags ── */}
          {data.flags.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Data Quality</h2>
              {data.flags.map((f) => <FlagAlert key={f.code} flag={f} />)}
            </div>
          )}

          {/* ── Rate + Invoice controls ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rate config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  Billing Configuration
                </CardTitle>
                <CardDescription>Straight time only — all hours × bill rate. No overtime.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {data.hasConfiguredRate ? (
                  <Alert className="border-green-500/40 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-sm font-medium">Rate from account</AlertTitle>
                    <AlertDescription className="text-sm">
                      ${data.configuredBillRate}/hr loaded from account's Services &amp; Billing.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-yellow-500/40 bg-yellow-500/5">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-sm font-medium">No rate configured</AlertTitle>
                    <AlertDescription className="text-sm">Enter a rate below to calculate amounts.</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="billRate">Bill Rate ($/hr) — straight time</Label>
                    <Input id="billRate" type="number" step="0.01" min="0"
                      value={billRate}
                      onChange={(e) => setBillRate(e.target.value)}
                      placeholder={data.configuredBillRate ? String(data.configuredBillRate) : "e.g. 22.00"}
                      data-testid="input-bill-rate" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="weekEnding">Week Ending Date</Label>
                    <Input id="weekEnding" type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} data-testid="input-week-ending" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invoiceNotes">Invoice Notes (optional)</Label>
                  <Input id="invoiceNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" data-testid="input-invoice-notes" />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {generateMutation.isSuccess ? (
                    <Alert className="border-green-500/40 bg-green-500/5 w-full">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-sm font-medium">{generateMutation.data?.invoiceNumber} Created</AlertTitle>
                      <AlertDescription className="text-sm">
                        Draft for {fmt(generateMutation.data?.subtotal ?? 0)}.{" "}
                        <button className="underline underline-offset-2 font-medium" onClick={() => navigate("/invoices")}>Open Invoices →</button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Button className="flex-1" disabled={!canGenerate || generateMutation.isPending}
                      onClick={() => generateMutation.mutate()} data-testid="button-generate-invoice">
                      {generateMutation.isPending
                        ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                        : <><FileText className="h-4 w-4 mr-2" />Save Draft Invoice</>}
                    </Button>
                  )}
                  <Button variant="outline" disabled={!canPdf || isPdfLoading}
                    onClick={handleDownloadPdf} data-testid="button-download-pdf">
                    {isPdfLoading
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating PDF…</>
                      : <><Download className="h-4 w-4 mr-2" />Download PDF</>}
                  </Button>
                  <Button variant="outline" disabled={!canPdf}
                    onClick={handlePrint} data-testid="button-print">
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick summary (by driver) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Driver Summary
                </CardTitle>
                <CardDescription>Hours per driver — all at straight time rate.</CardDescription>
              </CardHeader>
              <CardContent>
                {effectiveRate === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Enter a bill rate to see amounts.</p>
                ) : (() => {
                  // Aggregate by driver
                  const byDriver: Record<string, { hrs: number; amt: number; shifts: number }> = {};
                  for (const s of data.shifts) {
                    if (!byDriver[s.driverName]) byDriver[s.driverName] = { hrs: 0, amt: 0, shifts: 0 };
                    byDriver[s.driverName].hrs    += s.billableHrs;
                    byDriver[s.driverName].amt    += Math.round(s.billableHrs * effectiveRate * 100) / 100;
                    byDriver[s.driverName].shifts += 1;
                  }
                  const drivers = Object.entries(byDriver).sort((a, b) => b[1].amt - a[1].amt);
                  const dTotal  = drivers.reduce((s, [, v]) => s + v.amt, 0);
                  return (
                    <div className="rounded-md border divide-y">
                      {drivers.map(([name, v]) => (
                        <div key={name} className="px-4 py-3 flex items-center justify-between gap-2" data-testid={`summary-driver-${name.replace(/\s+/g, "-")}`}>
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-muted-foreground">{v.shifts} shift{v.shifts !== 1 ? "s" : ""} · {v.hrs.toFixed(2)} hrs × {fmt(effectiveRate)}</p>
                          </div>
                          <p className="font-semibold tabular-nums">{fmt(v.amt)}</p>
                        </div>
                      ))}
                      <div className="px-4 py-3 flex items-center justify-between bg-muted/30">
                        <div>
                          <p className="font-semibold text-sm">Total</p>
                          <p className="text-xs text-muted-foreground">{totalHours.toFixed(2)} hrs · straight time</p>
                        </div>
                        <p className="text-lg font-bold tabular-nums">{fmt(dTotal)}</p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* ── Invoice Preview ── */}
          {effectiveRate > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Invoice Preview</CardTitle>
                    <CardDescription>Branded shift invoice — one line per driver per date. Print or download PDF.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-preview">
                      <Printer className="h-4 w-4 mr-2" />Print
                    </Button>
                    <Button variant="outline" size="sm" disabled={isPdfLoading} onClick={handleDownloadPdf} data-testid="button-pdf-preview">
                      {isPdfLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      Download PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md p-6 bg-white shadow-sm">
                  <InvoicePreview
                    data={data}
                    billRate={effectiveRate}
                    weekEnding={weekEnding}
                    invoiceNumber={generateMutation.isSuccess ? generateMutation.data?.invoiceNumber : undefined}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Raw shift detail (operational audit view) ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Shift Detail — {data.shifts.length} shift{data.shifts.length !== 1 ? "s" : ""}
              </CardTitle>
              <CardDescription>
                Raw shift data sourced from WIW. Straight billable hours = actual clocked hours (or scheduled if no time record).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {["Date", "Driver", "Position", "Sched In", "Sched Out", "Clock In", "Clock Out", "Billable Hrs",
                        effectiveRate > 0 ? "Bill Rate" : null,
                        effectiveRate > 0 ? "Bill Amount" : null,
                        "Status"].filter(Boolean).map((h) => (
                        <th key={h!} className={`px-4 py-2.5 font-medium text-muted-foreground text-xs ${["Sched In","Sched Out","Clock In","Clock Out","Billable Hrs","Bill Rate","Bill Amount"].includes(h!) ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((row) => {
                      const amt = effectiveRate > 0 ? Math.round(row.billableHrs * effectiveRate * 100) / 100 : null;
                      return (
                        <tr key={row.shiftId} className="border-b hover-elevate" data-testid={`row-shift-${row.shiftId}`}>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{row.date}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{row.driverName}</div>
                            {row.employeeCode && <div className="text-xs text-muted-foreground">#{row.employeeCode}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.positionName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.scheduledStart}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.scheduledEnd}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.clockIn ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.clockOut ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{row.billableHrs.toFixed(2)}</td>
                          {effectiveRate > 0 && <td className="px-4 py-2.5 text-right tabular-nums">{fmt(effectiveRate)}</td>}
                          {effectiveRate > 0 && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(amt!)}</td>}
                          <td className="px-4 py-2.5 text-center"><StatusBadge status={row.approvalStatus} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-medium">
                      <td colSpan={effectiveRate > 0 ? 7 : 7} className="px-4 py-2.5 text-sm">Totals</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm">{totalHours.toFixed(2)}</td>
                      {effectiveRate > 0 && <td className="px-4 py-2.5 text-right tabular-nums text-sm">{fmt(effectiveRate)}</td>}
                      {effectiveRate > 0 && <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold">{fmt(grandTotal)}</td>}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
