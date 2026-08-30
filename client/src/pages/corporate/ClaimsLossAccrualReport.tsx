/**
 * ClaimsLossAccrualReport.tsx — Weekly Loss Accrual Report
 *
 * AUTHORITATIVE FIELD MAPPING (verified against shared/schema.ts accidents table):
 *   Total Estimated Loss  → accidents.probable_cost
 *     Rationale: This is DriverHub's primary claim cost estimate and is already
 *     used as "Financial Exposure" in the Claims Dashboard.
 *   Paid to Date          → accidents.actual_cost
 *     Rationale: Costs incurred/paid to date; already displayed as "Actual Cost"
 *     in the Claims List. NULL means no payment yet — treated as $0 paid.
 *   Outstanding Exposure  → MAX(0, probable_cost - actual_cost)
 *     Missing Estimate: When probable_cost IS NULL, financial columns show "—"
 *     and the claim is excluded from summary totals with a visible warning.
 *
 * ACQUISITION DATE: 2026-02-09 — only claims dated on or after this date are included.
 *
 * OPEN CLAIMS DEFINITION: claimStatus NOT IN {CLOSED, PAID, DENIED} and
 *   effective operational status not in closed/resolved outcomes.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  LayoutDashboard, ChevronLeft, RefreshCw, Download, Calendar,
  AlertTriangle, Loader2, X, FileText, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { Accident, DriverWithUser } from "@shared/schema";
import { ClaimStatusBadge } from "@/components/ClaimStatusBadge";

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIMARY = "#5737f2";
const ACQUISITION_DATE = new Date("2026-02-09T00:00:00");

/** Statuses that mean a claim is closed / resolved */
const CLOSED_STATUSES = new Set([
  "CLOSED", "PAID", "DENIED",
  "closed", "denied", "denied_abandoned", "abandoned",
  "driver_paid", "dod_paid", "insurance_paid", "paid_other_insurance", "paid_jri",
]);

function isOpenClaim(a: any): boolean {
  const cs = (a.claimStatus || "").toUpperCase();
  const os = (a.status || "").toLowerCase();
  return !CLOSED_STATUSES.has(cs) && !CLOSED_STATUSES.has(os);
}

function incidentDateOf(a: any): Date | null {
  const raw = a.incidentDate || a.accidentDate;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtDate(raw: string | Date | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function fmtReportDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function fmtCurrency(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtCurrencyZero(v: string | number | null | undefined): string {
  return fmtCurrency(v) ?? "$0.00";
}

function outstanding(probable: any, actual: any): number | null {
  const p = parseFloat(probable ?? "");
  if (isNaN(p)) return null;
  const a = parseFloat(actual ?? "0");
  return Math.max(0, p - (isNaN(a) ? 0 : a));
}

// ── Claim display ID ───────────────────────────────────────────────────────────

function displayId(a: any): string {
  return (a as any).displayClaimId || a.redcapId || (a.moveId ? a.moveId.slice(0, 8) : a.id.slice(0, 8));
}

// ── Schedule types ─────────────────────────────────────────────────────────────

interface ScheduleConfig {
  enabled: boolean;
  dayOfWeek: string;
  deliveryTime: string;
  recipients: string[];
  emailSubject: string;
  reportFormat: string;
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  dayOfWeek: "monday",
  deliveryTime: "08:00",
  recipients: [],
  emailSubject: "Weekly Loss Accrual Report - {{date}}",
  reportFormat: "csv",
};

// ── CSV export ──────────────────────────────────────────────────────────────────

function buildCsv(rows: any[], reportDate: string): string {
  const header = [
    "Claim #", "Incident Date", "Driver", "Claim Status",
    "Total Estimated Loss", "Paid to Date", "Outstanding Exposure", "Notes",
  ].join(",");

  const dataRows = rows.map((r) => {
    const prob = parseFloat(r.probableCost ?? "");
    const act = parseFloat(r.actualCost ?? "0");
    const os = outstanding(r.probableCost, r.actualCost);
    const notes = isNaN(prob) ? "Missing estimated loss" : "";
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
      q(displayId(r)),
      q(fmtDate(r.incidentDate || r.accidentDate)),
      q(r.driverName || "Unassigned"),
      q(r.status || r.claimStatus || "—"),
      isNaN(prob) ? "—" : prob.toFixed(2),
      isNaN(act) ? "0.00" : act.toFixed(2),
      os === null ? "—" : os.toFixed(2),
      q(notes),
    ].join(",");
  });

  return [`Weekly Loss Accrual Report — Report Date: ${reportDate}`, header, ...dataRows].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Schedule Dialog ─────────────────────────────────────────────────────────────

function ScheduleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedConfig } = useQuery<ScheduleConfig>({
    queryKey: ["/api/claims/reports/loss-accrual/schedule"],
    queryFn: async () => {
      const res = await fetch("/api/claims/reports/loss-accrual/schedule", { credentials: "include" });
      if (!res.ok) return DEFAULT_SCHEDULE;
      return res.json();
    },
    enabled: open,
  });

  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [recipientInput, setRecipientInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync when server data arrives
  useState(() => {
    if (savedConfig) setConfig(savedConfig);
  });

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (!email || !email.includes("@")) return;
    if (config.recipients.includes(email)) return;
    setConfig(c => ({ ...c, recipients: [...c.recipients, email] }));
    setRecipientInput("");
  };

  const removeRecipient = (email: string) => {
    setConfig(c => ({ ...c, recipients: c.recipients.filter(r => r !== email) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/claims/reports/loss-accrual/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["/api/claims/reports/loss-accrual/schedule"] });
      toast({ title: "Schedule saved", description: config.enabled ? "Scheduled delivery is active." : "Scheduled delivery is disabled." });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to save schedule configuration.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Schedule Weekly Delivery</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Scheduled Delivery</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically send this report on the configured schedule.
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={v => setConfig(c => ({ ...c, enabled: v }))}
            />
          </div>

          <div className={config.enabled ? "" : "opacity-40 pointer-events-none"}>

            {/* Day + time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Day of Week</Label>
                <Select value={config.dayOfWeek} onValueChange={v => setConfig(c => ({ ...c, dayOfWeek: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map(d => (
                      <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Delivery Time (CST)</Label>
                <Input
                  type="time"
                  value={config.deliveryTime}
                  onChange={e => setConfig(c => ({ ...c, deliveryTime: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Email subject */}
            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Email Subject</Label>
              <Input
                value={config.emailSubject}
                onChange={e => setConfig(c => ({ ...c, emailSubject: e.target.value }))}
                className="h-9 text-sm"
                placeholder="Weekly Loss Accrual Report - {{date}}"
              />
              <p className="text-[10px] text-muted-foreground">Use {"{{date}}"} to insert the report date.</p>
            </div>

            {/* Format */}
            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Report Format</Label>
              <Select value={config.reportFormat} onValueChange={v => setConfig(c => ({ ...c, reportFormat: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Excel-compatible)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recipients */}
            <div className="space-y-2 mt-3">
              <Label className="text-xs text-muted-foreground">Recipients</Label>
              {config.recipients.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No recipients configured.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {config.recipients.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full"
                  >
                    {email}
                    <button onClick={() => removeRecipient(email)} className="hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                  className="h-8 text-sm flex-1"
                />
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={addRecipient}>
                  Add
                </Button>
              </div>
            </div>

          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving} style={{ background: PRIMARY }} className="text-white">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Summary card ───────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, subLabel, onClick,
}: {
  label: string;
  value: string;
  subLabel?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl px-4 py-3 ${onClick ? "cursor-pointer hover:border-[#5737f2]/40 transition-colors" : ""}`}
      onClick={onClick}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
      <p className="text-xl font-bold tabular-nums text-[#182039] dark:text-foreground mt-1 leading-tight">{value}</p>
      {subLabel && <p className="text-[11px] text-muted-foreground mt-0.5">{subLabel}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClaimsLossAccrualReport() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const openScheduleFromUrl = new URLSearchParams(search).get("action") === "schedule";
  const [scheduleOpen, setScheduleOpen] = useState(openScheduleFromUrl);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const reportDate = useMemo(() => new Date(), []);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data: accidents = [], isLoading } = useQuery<Accident[]>({
    queryKey: ["/api/corporate/accidents"],
    staleTime: 2 * 60 * 1000,
  });

  const { data: drivers = [] } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
    staleTime: 5 * 60 * 1000,
  });

  // ── Report rows ───────────────────────────────────────────────────────────────
  const reportRows = useMemo(() => {
    return (accidents as any[])
      .filter((a) => {
        if (!isOpenClaim(a)) return false;
        const d = incidentDateOf(a);
        if (!d || d < ACQUISITION_DATE) return false;
        return true;
      })
      .map((a) => {
        // Resolve driver name
        const driverName: string = (() => {
          if (a.driverName) return a.driverName;
          const id = a.resolvedDriverId || a.driverId;
          if (!id) return "Unassigned";
          const dr = (drivers as any[]).find((d: any) => d.id === id);
          return dr ? `${dr.user?.firstName || ""} ${dr.user?.lastName || ""}`.trim() || "Unassigned" : "Unassigned";
        })();
        const driverId: string | null = a.resolvedDriverId || a.driverId || null;
        const effectiveStatus: string = a.status || a.claimStatus || "DRAFT";
        return { ...a, driverName, driverId, effectiveStatus };
      })
      .sort((a, b) => {
        const da = incidentDateOf(a)?.getTime() ?? 0;
        const db = incidentDateOf(b)?.getTime() ?? 0;
        return db - da; // newest first
      });
  }, [accidents, drivers]);

  // ── Summary totals ─────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalEstimated = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let missingEstimateCount = 0;

    for (const r of reportRows) {
      const prob = parseFloat((r as any).probableCost ?? "");
      const act = parseFloat((r as any).actualCost ?? "0");
      if (isNaN(prob)) {
        missingEstimateCount++;
      } else {
        totalEstimated += prob;
        const paidAmt = isNaN(act) ? 0 : act;
        totalPaid += paidAmt;
        totalOutstanding += Math.max(0, prob - paidAmt);
      }
    }
    return { totalEstimated, totalPaid, totalOutstanding, missingEstimateCount };
  }, [reportRows]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/corporate/accidents"] });
      // Record last generated time
      try {
        sessionStorage.setItem(
          "claimsReport.lossAccrual.lastGenerated",
          new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })
        );
      } catch {}
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const handleExportCsv = useCallback(() => {
    if (reportRows.length === 0) {
      toast({ title: "No data", description: "No qualifying claims to export." });
      return;
    }
    const rDate = fmtReportDate(reportDate).replace(/\//g, "-");
    const csv = buildCsv(reportRows, fmtReportDate(reportDate));
    downloadCsv(csv, `loss-accrual-report-${rDate}.csv`);
    toast({ title: "Export downloaded", description: `${reportRows.length} claims exported.` });
  }, [reportRows, reportDate, toast]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="border-b border-border px-6 py-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">
              Claims /{" "}
              <Link href="/claims/dashboard">
                <span className="hover:underline cursor-pointer font-medium text-foreground/70">Dashboard</span>
              </Link>{" "}
              /{" "}
              <Link href="/claims/reports">
                <span className="hover:underline cursor-pointer font-medium text-foreground/70">Reports</span>
              </Link>{" "}
              / <span className="font-medium text-foreground/70">Weekly Loss Accrual</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-tight mt-0.5">
              Weekly Loss Accrual Report
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[#d7dbe4]"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[#d7dbe4]"
              onClick={handleExportCsv}
              disabled={isLoading}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[#d7dbe4]"
              onClick={() => setScheduleOpen(true)}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Schedule
            </Button>
            <Link href="/claims/reports">
              <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]">
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Reports
              </Button>
            </Link>
            <Link href="/claims/dashboard">
              <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]">
                <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-10 max-w-[1400px] mx-auto space-y-4">

        {/* Report meta row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Report Date:</span>{" "}
              {fmtReportDate(reportDate)}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>All open damage claims as of report date</span>
            <span className="text-muted-foreground/40">|</span>
            <span>Claims from 02/09/2026 forward</span>
          </div>
          {isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading claims data…
            </div>
          )}
        </div>

        {/* Missing estimate warning */}
        {!isLoading && summary.missingEstimateCount > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                {summary.missingEstimateCount.toLocaleString()} claim{summary.missingEstimateCount !== 1 ? "s" : ""} missing estimated loss data.
              </span>{" "}
              <span className="text-amber-700 dark:text-amber-400">
                These claims appear in the detail table with "—" but are excluded from summary totals. Accounting should be aware that the total exposure is understated by the number of unquantified claims.
              </span>
            </div>
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Open Claims"
            value={reportRows.length.toLocaleString("en-US")}
            subLabel={summary.missingEstimateCount > 0 ? `${summary.missingEstimateCount} missing estimate` : undefined}
          />
          <SummaryCard
            label="Total Estimated Losses"
            value={fmtCurrencyZero(summary.totalEstimated)}
            subLabel="Based on probable cost"
          />
          <SummaryCard
            label="Total Paid to Date"
            value={fmtCurrencyZero(summary.totalPaid)}
            subLabel="Based on actual cost"
          />
          <SummaryCard
            label="Total Outstanding Exposure"
            value={fmtCurrencyZero(summary.totalOutstanding)}
            subLabel="Estimated − Paid"
          />
        </div>

        {/* Field mapping note */}
        <div className="text-[11px] text-muted-foreground/70 border border-dashed border-muted-foreground/20 rounded-lg px-3 py-2 space-y-0.5">
          <span className="font-semibold text-muted-foreground">Field Mapping:</span>{" "}
          Total Estimated Loss = <code className="bg-muted rounded px-1 text-[10px]">probable_cost</code> ·
          Paid to Date = <code className="bg-muted rounded px-1 text-[10px]">actual_cost</code> ·
          Outstanding Exposure = MAX(0, Estimated − Paid) ·
          "—" indicates missing data excluded from totals.
        </div>

        {/* Report table */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reportRows.length === 0 ? (
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl px-6 py-16 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No qualifying open claims found for the report date.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">
            <Table className="[&_td]:py-2 [&_th]:py-2 [&_td]:text-[13px]">
              <TableHeader>
                <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee] dark:border-border">
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">Claim #</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">Incident Date</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">Driver</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap">Claim Status</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap text-right">Total Estimated Loss</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap text-right">Paid to Date</TableHead>
                  <TableHead className="text-[13px] font-semibold text-foreground/80 whitespace-nowrap text-right">Outstanding Exposure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportRows.map((r: any, idx) => {
                  const prob = parseFloat(r.probableCost ?? "");
                  const act = parseFloat(r.actualCost ?? "0");
                  const exp = outstanding(r.probableCost, r.actualCost);
                  const missingEst = isNaN(prob);
                  const claimLink = `/accidents/${r.id}`;

                  return (
                    <TableRow
                      key={r.id}
                      className={`border-b border-[#eceef3] dark:border-border last:border-0 ${missingEst ? "bg-amber-50/30 dark:bg-amber-900/5" : "hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10"}`}
                    >
                      {/* Claim # — links to Claim Detail */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Link href={claimLink}>
                          <span className="text-[#5737f2] hover:underline cursor-pointer font-mono text-[12px]">
                            {displayId(r)}
                          </span>
                        </Link>
                        {missingEst && (
                          <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase tracking-wide">
                            Missing Est.
                          </span>
                        )}
                      </TableCell>
                      {/* Incident Date */}
                      <TableCell className="text-muted-foreground whitespace-nowrap text-[12px]">
                        {fmtDate(r.incidentDate || r.accidentDate)}
                      </TableCell>
                      {/* Driver */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {r.driverId ? (
                          <Link href={`/drivers/${r.driverId}`}>
                            <span className="text-muted-foreground hover:underline hover:text-foreground cursor-pointer text-[12px]">
                              {r.driverName}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-[12px]">{r.driverName}</span>
                        )}
                      </TableCell>
                      {/* Claim Status */}
                      <TableCell>
                        <ClaimStatusBadge status={r.effectiveStatus} size="sm" />
                      </TableCell>
                      {/* Total Estimated Loss */}
                      <TableCell className="text-right whitespace-nowrap tabular-nums text-[12px]">
                        {missingEst ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span>{fmtCurrency(prob)}</span>
                        )}
                      </TableCell>
                      {/* Paid to Date */}
                      <TableCell className="text-right whitespace-nowrap tabular-nums text-[12px]">
                        {fmtCurrencyZero(isNaN(act) ? 0 : act)}
                      </TableCell>
                      {/* Outstanding Exposure */}
                      <TableCell className="text-right whitespace-nowrap tabular-nums text-[12px]">
                        {exp === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={exp > 0 ? "font-medium" : "text-muted-foreground"}>
                            {fmtCurrency(exp)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Table footer summary */}
            <div className="border-t border-[#e4e7ee] dark:border-border bg-[#f7f8fb] dark:bg-muted/20 px-4 py-2.5 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground font-medium">
                {reportRows.length.toLocaleString()} open claim{reportRows.length !== 1 ? "s" : ""}
                {summary.missingEstimateCount > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    ({summary.missingEstimateCount} missing estimate, excluded from totals)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-6 text-right">
                <div>
                  <span className="text-muted-foreground">Total Estimated: </span>
                  <span className="font-semibold tabular-nums">{fmtCurrencyZero(summary.totalEstimated)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Paid: </span>
                  <span className="font-semibold tabular-nums">{fmtCurrencyZero(summary.totalPaid)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Outstanding: </span>
                  <span className="font-semibold tabular-nums text-[#182039] dark:text-foreground">{fmtCurrencyZero(summary.totalOutstanding)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Schedule dialog */}
      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
