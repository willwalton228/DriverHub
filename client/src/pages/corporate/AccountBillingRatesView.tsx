/**
 * AccountBillingRatesView.tsx — DH-002073
 *
 * Centralized billing-rate management view across all Accounts.
 *
 * ARCHITECTURE:
 *   - Source of truth: account_service_rates.bill_rate
 *   - Changes made here update the same record displayed in Account Detail → Services & Billing
 *   - No duplicate pricing tables — this view is a filtered window onto the same data
 *   - Inline auto-save with Saving / Saved / Error state per row
 *   - Full audit trail via account_billing_rate_audit
 *
 * MIGRATION:
 *   - customers.shift_bill_rate values can be migrated to account_service_rates via
 *     the "Migrate Shift Rates" admin action (POST /api/accounts/billing-rates/migrate-shift-rates)
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft, Download, Search, Check, Loader2, AlertCircle, X,
  Filter, RefreshCw, History, ChevronDown, ChevronRight, ExternalLink,
  ShieldAlert, Wrench, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { exportToExcel } from "@/lib/excelExport";

const PRIMARY = "#5737f2";

const BILLING_ADMIN_ROLES = new Set([
  "super_user", "root_super_admin", "super_admin", "admin", "finance", "corporate_admin",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

interface BillingRateRow {
  customer_id: string;
  customer_name: string;
  dealer_id: string | null;
  network: string | null;
  account_status: string | null;
  account_product_id: string;
  service_active: boolean;
  billing_method: string | null;
  billing_frequency_override: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  pricing_model: string | null;
  billing_frequency: string | null;
  product_type: string | null;
  service_category: string | null;
  position_id: string | null;
  position_name: string | null;
  rate_id: string | null;
  bill_rate: string | null;
  rate_type: string | null;
  billing_unit: string | null;
  effective_date: string | null;
  end_date: string | null;
  rate_active: boolean | null;
  rate_notes: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

// ── Save state indicator ──────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Loader2 className="h-2.5 w-2.5 animate-spin" />
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
      <Check className="h-2.5 w-2.5" />
      Saved
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-destructive">
      <AlertCircle className="h-2.5 w-2.5" />
      Error
    </span>
  );
}

// ── Migration banner ──────────────────────────────────────────────────────────

interface MigrationBannerProps {
  pendingCount: number;
  onRunMigration: () => void;
  migrating: boolean;
  isBillingAdmin: boolean;
}

function MigrationBanner({ pendingCount, onRunMigration, migrating, isBillingAdmin }: MigrationBannerProps) {
  if (pendingCount === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {pendingCount} account{pendingCount !== 1 ? "s have" : " has"} a legacy Shift Bill Rate that has not yet been migrated to the Services & Billing framework.
        </p>
        <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-0.5">
          These rates are stored on the account record directly. Run the migration to move them into the Product/Service rate system where they can be managed from this view.
        </p>
      </div>
      {isBillingAdmin && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-8 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600"
          onClick={onRunMigration}
          disabled={migrating}
        >
          {migrating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wrench className="h-3 w-3 mr-1" />}
          Migrate Shift Rates
        </Button>
      )}
    </div>
  );
}

// ── Audit dialog ──────────────────────────────────────────────────────────────

function AuditDialog({
  open,
  onClose,
  rateId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  rateId: string | null;
  label: string;
}) {
  const { data: auditLog = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounts/billing-rates/audit", rateId],
    queryFn: async () => {
      if (!rateId) return [];
      const res = await fetch(`/api/accounts/billing-rates/audit?rateId=${rateId}&limit=20`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!rateId,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base">Rate History — {label}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No history recorded for this rate.</p>
        ) : (
          <Table className="[&_td]:py-1.5 [&_th]:py-1.5 [&_td]:text-[12px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Date</TableHead>
                <TableHead className="text-[11px]">Changed By</TableHead>
                <TableHead className="text-[11px] text-right">Previous</TableHead>
                <TableHead className="text-[11px] text-right">New</TableHead>
                <TableHead className="text-[11px]">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(entry.changed_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.changed_by_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCurrency(entry.previous_rate)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(entry.new_rate)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {entry.change_source}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Migration results dialog ──────────────────────────────────────────────────

function MigrationResultsDialog({
  open,
  onClose,
  results,
  isDryRun,
  onConfirm,
  migrating,
}: {
  open: boolean;
  onClose: () => void;
  results: any;
  isDryRun: boolean;
  onConfirm: () => void;
  migrating: boolean;
}) {
  if (!results) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[600px] max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{isDryRun ? "Migration Preview" : "Migration Complete"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {isDryRun && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
              This is a dry run. No changes have been made yet. Review the results below, then click Confirm to execute.
            </div>
          )}
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{isDryRun ? results.wouldMigrate : results.migrated}</p>
              <p className="text-[11px] text-muted-foreground">{isDryRun ? "Would migrate" : "Migrated"}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{results.skipped}</p>
              <p className="text-[11px] text-muted-foreground">Skipped</p>
            </div>
            {results.shiftProductFound && (
              <div className="text-center">
                <p className="text-sm font-semibold text-emerald-600">{results.shiftProductName}</p>
                <p className="text-[11px] text-muted-foreground">DriverShift product</p>
              </div>
            )}
          </div>
          {results.results?.length > 0 && (
            <Table className="[&_td]:py-1 [&_th]:py-1 [&_td]:text-[12px] border rounded-lg overflow-hidden">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Account</TableHead>
                  <TableHead className="text-[11px]">Dealer ID</TableHead>
                  <TableHead className="text-[11px] text-right">Shift Rate</TableHead>
                  <TableHead className="text-[11px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.results.map((r: any) => (
                  <TableRow key={r.accountId}>
                    <TableCell className="font-medium">{r.accountName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.dealerId || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCurrency(r.shiftBillRate)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[9px] h-4 px-1 ${
                          r.status === "migrated" ? "border-emerald-400 text-emerald-700" :
                          r.status === "already_migrated" ? "border-blue-400 text-blue-700" :
                          "border-amber-400 text-amber-700"
                        }`}
                      >
                        {r.status === "pending" ? "will migrate" :
                         r.status === "already_migrated" ? "already done" :
                         r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {isDryRun && results.wouldMigrate > 0 && (
            <Button
              size="sm"
              className="text-white"
              style={{ background: PRIMARY }}
              onClick={onConfirm}
              disabled={migrating}
            >
              {migrating ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Check className="h-3 w-3 mr-1.5" />}
              Confirm Migration
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AccountBillingRatesView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const userRole = (user as any)?.role || (user as any)?.claims?.metadata?.role || "";
  const isBillingAdmin = BILLING_ADMIN_ROLES.has(userRole);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [filterNetwork, setFilterNetwork] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterActiveOnly, setFilterActiveOnly] = useState(true);

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [localRates, setLocalRates] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Audit dialog ───────────────────────────────────────────────────────────
  const [auditDialog, setAuditDialog] = useState<{ rateId: string; label: string } | null>(null);

  // ── Migration state ────────────────────────────────────────────────────────
  const [migrationResults, setMigrationResults] = useState<any>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [migrationIsDryRun, setMigrationIsDryRun] = useState(true);
  const [migrating, setMigrating] = useState(false);

  // ── Group expand ───────────────────────────────────────────────────────────
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"account" | "product">("account");

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: rows = [], isLoading, refetch } = useQuery<BillingRateRow[]>({
    queryKey: ["/api/accounts/billing-rates", filterActiveOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterActiveOnly) params.set("activeOnly", "true");
      const res = await fetch(`/api/accounts/billing-rates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch billing rates");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Also fetch accounts with legacy shiftBillRate (for migration banner)
  const { data: legacyRates = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers"],
    select: (customers: any[]) => customers.filter((c: any) => c.shiftBillRate && parseFloat(c.shiftBillRate) > 0),
    staleTime: 5 * 60 * 1000,
  });

  // Initialize local rate inputs when data loads
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const r of rows) {
      if (r.rate_id && r.bill_rate !== null) {
        initial[r.rate_id] = parseFloat(r.bill_rate).toFixed(2);
      }
    }
    setLocalRates(prev => ({ ...initial, ...prev }));
  }, [rows]);

  // ── Derived networks / products for filter options ────────────────────────
  const networkOptions = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach(r => { if (r.network) seen.add(r.network); });
    return [...seen].sort();
  }, [rows]);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(r => seen.set(r.product_id, r.product_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.dealer_id || "").toLowerCase().includes(q)
      );
    }
    if (filterNetwork !== "all") {
      result = result.filter(r => r.network === filterNetwork);
    }
    if (filterServiceType !== "all") {
      const st = filterServiceType.toLowerCase();
      result = result.filter(r => {
        const pn = (r.product_name || "").toLowerCase();
        if (st === "shift") return pn.includes("shift") || pn.includes("drivershift");
        if (st === "demand") return pn.includes("dash") || pn.includes("on-demand") || pn.includes("on demand");
        return true;
      });
    }
    return result;
  }, [rows, searchText, filterNetwork, filterServiceType]);

  // ── Grouped view (by account) ─────────────────────────────────────────────
  const grouped = useMemo(() => {
    const groups = new Map<string, { customerId: string; customerName: string; dealerId: string | null; network: string | null; rows: BillingRateRow[] }>();
    for (const r of filteredRows) {
      if (!groups.has(r.customer_id)) {
        groups.set(r.customer_id, { customerId: r.customer_id, customerName: r.customer_name, dealerId: r.dealer_id, network: r.network, rows: [] });
      }
      groups.get(r.customer_id)!.rows.push(r);
    }
    return [...groups.values()].sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [filteredRows]);

  const totalRows = filteredRows.filter(r => r.rate_id).length;

  // ── Inline save ───────────────────────────────────────────────────────────
  const handleRateBlur = useCallback(async (rateId: string) => {
    const val = localRates[rateId];
    const original = rows.find(r => r.rate_id === rateId)?.bill_rate;
    const originalFmt = original !== null && original !== undefined ? parseFloat(original).toFixed(2) : null;

    // Skip if unchanged
    if (val === originalFmt) return;

    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) {
      setSaveStates(s => ({ ...s, [rateId]: "error" }));
      toast({ title: "Invalid rate", description: "Enter a valid positive number.", variant: "destructive" });
      return;
    }

    setSaveStates(s => ({ ...s, [rateId]: "saving" }));

    try {
      const res = await fetch(`/api/accounts/billing-rates/rates/${rateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ billRate: parsed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save");
      }

      setSaveStates(s => ({ ...s, [rateId]: "saved" }));
      // Invalidate so AccountServicesTab stays in sync
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/billing-rates", filterActiveOnly] });

      // Auto-clear "Saved" after 3 s
      if (savedTimers.current[rateId]) clearTimeout(savedTimers.current[rateId]);
      savedTimers.current[rateId] = setTimeout(() => {
        setSaveStates(s => ({ ...s, [rateId]: "idle" }));
      }, 3000);
    } catch (err: any) {
      setSaveStates(s => ({ ...s, [rateId]: "error" }));
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }, [localRates, rows, filterActiveOnly, queryClient, toast]);

  // ── Migration ─────────────────────────────────────────────────────────────
  const runMigration = useCallback(async (dryRun: boolean) => {
    setMigrating(true);
    try {
      const res = await fetch("/api/accounts/billing-rates/migrate-shift-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Migration failed");
      }
      const data = await res.json();
      setMigrationResults(data);
      setMigrationIsDryRun(dryRun);
      setShowMigrationDialog(true);
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["/api/accounts/billing-rates"] });
        queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
        toast({ title: "Migration complete", description: `${data.migrated} rate${data.migrated !== 1 ? "s" : ""} migrated.` });
      }
    } catch (err: any) {
      toast({ title: "Migration failed", description: err.message, variant: "destructive" });
    } finally {
      setMigrating(false);
    }
  }, [queryClient, toast]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const data = filteredRows.filter(r => r.rate_id).map(r => ({
      "Account Name": r.customer_name,
      "Dealer ID": r.dealer_id || "",
      "Network": r.network || "",
      "Account Status": r.account_status || "",
      "Product / Service": r.product_name,
      "Position / Variant": r.position_name || "",
      "Bill Rate": r.bill_rate !== null ? parseFloat(r.bill_rate ?? "0") : "",
      "Rate Type": r.rate_type || "",
      "Billing Unit": r.billing_unit || "",
      "Pricing Model": r.pricing_model || "",
      "Billing Frequency": r.billing_frequency_override || r.billing_frequency || "",
      "Effective Date": fmtDate(r.effective_date),
      "Service Active": r.service_active ? "Yes" : "No",
      "Rate Active": r.rate_active ? "Yes" : "No",
    }));
    const cols = Object.keys(data[0] || {}).map(h => ({ header: h, key: h, width: 18 }));
    exportToExcel(data, cols, "account-billing-rates");
  }, [filteredRows]);

  // ── Expand all on first load ───────────────────────────────────────────────
  useEffect(() => {
    if (grouped.length > 0 && expandedAccounts.size === 0) {
      setExpandedAccounts(new Set(grouped.map(g => g.customerId)));
    }
  }, [grouped]);

  const toggleAccount = (id: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeFilterCount = [
    searchText !== "",
    filterNetwork !== "all",
    filterServiceType !== "all",
    !filterActiveOnly,
  ].filter(Boolean).length;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="border-b border-border px-6 py-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">
              <Link href="/customers"><span className="hover:underline cursor-pointer font-medium text-foreground/70">Accounts</span></Link>{" "}
              / <span className="font-medium text-foreground/70">Billing Rates</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-tight mt-0.5">
              Account Billing Rates
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {!isBillingAdmin && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border/60 rounded-lg px-2 py-1">
                <ShieldAlert className="h-3 w-3" />
                Read-only — billing admin required to edit
              </div>
            )}
            <Button
              variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]"
              onClick={handleExport}
              disabled={filteredRows.length === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            <Link href="/customers">
              <Button variant="outline" size="sm" className="h-8 text-xs border-[#d7dbe4]">
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Accounts
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div className="border-b border-border/50 px-6 py-2 flex items-center gap-2 flex-wrap bg-background">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Account name or Dealer ID…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="h-7 text-[12px] pl-7 w-[200px] border-[#d7dbe4]"
            />
          </div>

          {/* Network */}
          <Select value={filterNetwork} onValueChange={setFilterNetwork}>
            <SelectTrigger className={`h-7 text-[12px] border-[#d7dbe4] px-2 min-w-[130px] ${filterNetwork !== "all" ? "border-[#5737f2]/50 bg-[#5737f2]/5 text-[#5737f2]" : ""}`}>
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All Networks</SelectItem>
              {networkOptions.map(n => <SelectItem key={n} value={n} className="text-[12px]">{n}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Service type */}
          <Select value={filterServiceType} onValueChange={setFilterServiceType}>
            <SelectTrigger className={`h-7 text-[12px] border-[#d7dbe4] px-2 min-w-[150px] ${filterServiceType !== "all" ? "border-[#5737f2]/50 bg-[#5737f2]/5 text-[#5737f2]" : ""}`}>
              <SelectValue placeholder="Service type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All Services</SelectItem>
              <SelectItem value="shift" className="text-[12px]">DriverShift</SelectItem>
              <SelectItem value="demand" className="text-[12px]">DriverDash / On-Demand</SelectItem>
            </SelectContent>
          </Select>

          {/* Active only toggle */}
          <button
            onClick={() => setFilterActiveOnly(v => !v)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors
              ${filterActiveOnly
                ? "border-[#5737f2]/50 bg-[#5737f2]/5 text-[#5737f2]"
                : "border-[#d7dbe4] bg-background text-foreground/70 hover:bg-muted/40"
              }`}
          >
            <Check className={`h-3 w-3 ${filterActiveOnly ? "" : "opacity-0"}`} />
            Active accounts only
          </button>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setSearchText(""); setFilterNetwork("all"); setFilterServiceType("all"); setFilterActiveOnly(true); }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="h-3 w-3" />
              Clear {activeFilterCount}
            </button>
          )}

          <div className="ml-auto text-[11px] text-muted-foreground">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${totalRows.toLocaleString()} rate${totalRows !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-3 pb-10 max-w-[1600px] mx-auto space-y-3">

        {/* Migration banner */}
        {legacyRates.length > 0 && isBillingAdmin && (
          <MigrationBanner
            pendingCount={legacyRates.length}
            onRunMigration={() => runMigration(true)}
            migrating={migrating}
            isBillingAdmin={isBillingAdmin}
          />
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">No billing rate records match the current filters.</p>
            <p className="text-xs text-muted-foreground mt-1">Rates are created in Account Detail → Services & Billing.</p>
          </div>
        ) : (
          /* ── Rate table (grouped by account) ───────────────────────────── */
          <div className="bg-white dark:bg-card border border-[#e4e7ee] dark:border-border rounded-xl overflow-hidden">
            <Table className="[&_td]:py-2 [&_th]:py-2 [&_td]:text-[13px]">
              <TableHeader>
                <TableRow className="bg-[#f7f8fb] dark:bg-muted/30 hover:bg-[#f7f8fb] dark:hover:bg-muted/30 border-b border-[#e4e7ee]">
                  <TableHead className="w-8 py-2" />
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Account / Dealer ID</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Network</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Product / Service</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Position / Variant</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80 text-right">Bill Rate</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Pricing Model</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Billing Freq.</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Unit</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Effective Date</TableHead>
                  <TableHead className="text-[12px] font-semibold text-foreground/80">Status</TableHead>
                  <TableHead className="w-8 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(group => (
                  <>
                    {/* Account group header */}
                    <TableRow
                      key={`group-${group.customerId}`}
                      className="bg-[#f4f5fb] dark:bg-muted/20 hover:bg-[#eeeffe] dark:hover:bg-muted/30 cursor-pointer border-b border-[#e4e7ee]"
                      onClick={() => toggleAccount(group.customerId)}
                    >
                      <TableCell className="py-2">
                        {expandedAccounts.has(group.customerId)
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </TableCell>
                      <TableCell colSpan={10} className="py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-semibold text-[13px] text-[#5737f2] hover:underline cursor-pointer"
                            onClick={e => { e.stopPropagation(); navigate(`/customers/${group.customerId}`); }}
                          >
                            {group.customerName}
                          </span>
                          {group.dealerId && (
                            <span className="text-[11px] text-muted-foreground font-mono">#{group.dealerId}</span>
                          )}
                          {group.network && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{group.network}</Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-[#d7dbe4]">
                            {group.rows.filter(r => r.rate_id).length} rate{group.rows.filter(r => r.rate_id).length !== 1 ? "s" : ""}
                          </Badge>
                          <Link href={`/customers/${group.customerId}`}>
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()} />
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="py-2" />
                    </TableRow>

                    {/* Rate rows for this account */}
                    {expandedAccounts.has(group.customerId) && group.rows.map((r, ri) => (
                      <TableRow
                        key={r.rate_id ?? `${r.account_product_id}-${ri}`}
                        className="border-b border-[#eceef3] dark:border-border last:border-0 hover:bg-[#f7f8fb]/60 dark:hover:bg-muted/10"
                      >
                        <TableCell className="pl-8 py-2" />
                        {/* Account (merged — indented) */}
                        <TableCell className="py-2">
                          {!r.service_active && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-muted-foreground/30 text-muted-foreground mr-1.5">
                              inactive service
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[12px]">{r.network || "—"}</TableCell>
                        <TableCell className="text-[12px]">
                          <div className="font-medium text-foreground/90">{r.product_name}</div>
                          {r.product_sku && <div className="text-[10px] text-muted-foreground font-mono">{r.product_sku}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[12px]">
                          {r.position_name || <span className="italic text-muted-foreground/50">No position</span>}
                        </TableCell>

                        {/* Bill rate — inline editable */}
                        <TableCell className="text-right py-1.5">
                          {r.rate_id ? (
                            <div className="flex flex-col items-end gap-0.5">
                              {isBillingAdmin ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[12px] text-muted-foreground">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={localRates[r.rate_id] ?? (r.bill_rate !== null ? parseFloat(r.bill_rate).toFixed(2) : "")}
                                    onChange={e => setLocalRates(prev => ({ ...prev, [r.rate_id!]: e.target.value }))}
                                    onBlur={() => handleRateBlur(r.rate_id!)}
                                    className={`
                                      w-[90px] text-right text-[12px] tabular-nums font-semibold
                                      border rounded px-1.5 py-0.5 bg-background
                                      focus:outline-none focus:ring-1 focus:ring-[#5737f2]
                                      ${saveStates[r.rate_id] === "error" ? "border-destructive" : "border-[#d7dbe4]"}
                                    `}
                                  />
                                </div>
                              ) : (
                                <span className="text-[12px] tabular-nums font-semibold">{fmtCurrency(r.bill_rate)}</span>
                              )}
                              <SaveIndicator state={saveStates[r.rate_id] ?? "idle"} />
                            </div>
                          ) : (
                            <span className="text-[12px] text-muted-foreground/50 italic">no rate</span>
                          )}
                        </TableCell>

                        <TableCell className="text-muted-foreground text-[12px]">{r.pricing_model || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-[12px]">
                          {r.billing_frequency_override || r.billing_frequency || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[12px]">{r.billing_unit || "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-[12px]">
                          {fmtDate(r.effective_date)}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {r.rate_id ? (
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-4 px-1 ${
                                r.rate_active
                                  ? "border-emerald-400 text-emerald-700 dark:text-emerald-400"
                                  : "border-muted-foreground/30 text-muted-foreground"
                              }`}
                            >
                              {r.rate_active ? "Active" : "Inactive"}
                            </Badge>
                          ) : "—"}
                        </TableCell>

                        {/* History */}
                        <TableCell className="py-2">
                          {r.rate_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setAuditDialog({ rateId: r.rate_id!, label: `${r.customer_name} — ${r.product_name}${r.position_name ? ` / ${r.position_name}` : ""}` })}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Rate history</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>

            {/* Footer summary */}
            <div className="border-t border-[#e4e7ee] bg-[#f7f8fb] dark:bg-muted/20 px-4 py-2 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">
                {grouped.length.toLocaleString()} account{grouped.length !== 1 ? "s" : ""} · {totalRows.toLocaleString()} rate{totalRows !== 1 ? "s" : ""}
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`}
              </span>
              {!isBillingAdmin && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Read-only view
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audit dialog */}
      <AuditDialog
        open={!!auditDialog}
        onClose={() => setAuditDialog(null)}
        rateId={auditDialog?.rateId ?? null}
        label={auditDialog?.label ?? ""}
      />

      {/* Migration results dialog */}
      <MigrationResultsDialog
        open={showMigrationDialog}
        onClose={() => { setShowMigrationDialog(false); setMigrationResults(null); }}
        results={migrationResults}
        isDryRun={migrationIsDryRun}
        onConfirm={() => runMigration(false)}
        migrating={migrating}
      />
    </div>
  );
}
