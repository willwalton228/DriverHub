/**
 * ProductLibraryDashboard.tsx — Product Library Executive Dashboard
 *
 * Answers one question: "Is my Product Library healthy and performing as expected?"
 *
 * Follows DriverHub Dashboard Standard (ClaimsDashboard.tsx is the authority).
 *
 * DATA SOURCES:
 *   GET /api/finance/products               — full product catalog
 *   GET /api/finance/account-products       — account-level product assignments
 *   GET /api/billing/charges?dateFrom=&dateTo= — current-month billable charges
 *
 * UNAVAILABLE METRICS (no supporting schema):
 *   • Gross Profit by Products  — requires COGS fields not in billable_charges
 *   • Pending Quotes            — no quotes/pipeline table in schema
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, RefreshCw, ChevronRight, ArrowRight, CheckCircle2,
  Layers, AlertTriangle, DollarSign, Info, TrendingUp,
  AlertCircle, Clock, Plus, Pencil, ZapOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SERVICE_CATEGORY_LABELS } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = "#5737f2";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function currentMonthRange(): { dateFrom: string; dateTo: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${d}`,
    label: monthName,
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fmtDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

// ─── Section header (DriverHub dashboard standard) ────────────────────────────

function SectionHeader({
  num, title, actionLabel, actionHref,
}: { num: number; title: string; actionLabel?: string; actionHref?: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
          style={{ background: PRIMARY }}
        >
          {num}
        </span>
        <h2 className="text-xs font-semibold text-[#182039] dark:text-foreground tracking-wide uppercase">
          {title}
        </h2>
      </div>
      {actionLabel && actionHref && (
        <button
          className="text-xs font-medium hover:underline flex items-center gap-0.5"
          style={{ color: PRIMARY }}
          onClick={() => navigate(actionHref)}
        >
          {actionLabel} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── KPI card (ClaimsDashboard standard) ─────────────────────────────────────

function KpiCard({
  title, value, subLabel, href, isLoading,
}: {
  title: string;
  value: string;
  subLabel?: string;
  href?: string;
  isLoading?: boolean;
}) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <Card className="border border-border/50 shadow-none">
        <CardContent className="px-2.5 py-2 space-y-1">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-2.5 w-16" />
        </CardContent>
      </Card>
    );
  }

  const inner = (
    <Card
      className={`border border-border/50 shadow-none transition-all h-full ${
        href ? "hover:border-[#5737f2]/40 hover:shadow-sm cursor-pointer group" : ""
      }`}
    >
      <CardContent className="px-2.5 py-2">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">
          {title}
        </p>
        <p className="text-xl font-bold mt-0.5 text-[#182039] dark:text-foreground tabular-nums leading-tight">
          {value}
        </p>
        {subLabel && (
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{subLabel}</p>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <button onClick={() => navigate(href)} className="w-full text-left h-full">
        {inner}
      </button>
    );
  }
  return inner;
}

// ─── Unavailable KPI card (matches ClaimsDashboard UnavailableCard) ───────────

function UnavailableCard({ title, note }: { title: string; note: string }) {
  return (
    <Card className="border border-border/50 shadow-none opacity-55">
      <CardContent className="px-2.5 py-2">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none truncate">
            {title}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/50 mt-px" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">{note}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-0.5">
          <span className="text-xl font-bold tabular-nums text-muted-foreground/25">—</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Health check card (clickable count → filtered list view) ─────────────────

function HealthCard({
  title, count, total, href, accent, icon: Icon, isLoading,
}: {
  title: string;
  count: number;
  total: number;
  href: string;
  accent: "ok" | "warn" | "critical";
  icon: React.ElementType;
  isLoading?: boolean;
}) {
  const [, navigate] = useLocation();

  const accentColor = accent === "ok"
    ? "#16a34a"
    : accent === "warn"
    ? "#f59e0b"
    : "#dc2626";

  if (isLoading) {
    return (
      <Card className="border border-border/50 shadow-none">
        <CardContent className="px-2.5 py-2 space-y-1">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-5 w-10" />
        </CardContent>
      </Card>
    );
  }

  return (
    <button onClick={() => navigate(href)} className="w-full text-left h-full">
      <Card className="border border-border/50 shadow-none hover:border-[#5737f2]/40 hover:shadow-sm transition-all cursor-pointer group h-full">
        <CardContent className="px-2.5 py-2">
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors min-w-0">
              <Icon className="h-3 w-3 shrink-0" />
              <span className="text-[11px] font-medium leading-tight">{title}</span>
            </div>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-primary transition-colors mt-px" />
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums" style={{ color: count > 0 ? accentColor : "#16a34a" }}>
              {count.toLocaleString()}
            </span>
            {total > 0 && (
              <span className="text-[10px] text-muted-foreground">
                of {total.toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ─── Attention item row ───────────────────────────────────────────────────────

function AttentionRow({
  product,
  issue,
  issueIcon: IssueIcon,
  issueColor,
}: {
  product: any;
  issue: string;
  issueIcon: React.ElementType;
  issueColor: string;
}) {
  const [, navigate] = useLocation();

  return (
    <button
      className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 transition-colors rounded-md"
      onClick={() => navigate(`/admin/products/${product.id}`)}
    >
      <div
        className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
        style={{ background: `${issueColor}18` }}
      >
        <IssueIcon className="h-3 w-3" style={{ color: issueColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight truncate">{product.name}</p>
        <p className="text-[10px] leading-tight truncate" style={{ color: issueColor }}>
          {issue}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          {product.sku ?? "—"}
        </p>
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          {SERVICE_CATEGORY_LABELS[product.serviceCategory as string] ??
            product.serviceCategory ?? "—"}
        </p>
      </div>
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ProductLibraryDashboard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const mtd = useMemo(() => currentMonthRange(), []);

  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: allProducts = [], isLoading: prodLoading } = useQuery<any[]>({
    queryKey: ["/api/finance/products"],
    queryFn: () =>
      fetch("/api/finance/products", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: allAccountProducts = [], isLoading: apLoading } = useQuery<any[]>({
    queryKey: ["/api/finance/account-products"],
    queryFn: () =>
      fetch("/api/finance/account-products", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: mtdCharges = [], isLoading: chargesLoading } = useQuery<any[]>({
    queryKey: ["/api/billing/charges", mtd.dateFrom, mtd.dateTo],
    queryFn: () =>
      fetch(
        `/api/billing/charges?dateFrom=${mtd.dateFrom}&dateTo=${mtd.dateTo}`,
        { credentials: "include" },
      ).then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
  });

  const isLoading = prodLoading || apLoading;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/finance/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/finance/account-products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/charges"] });
  }

  // ── Executive Summary KPIs ────────────────────────────────────────────────
  const activeCount = useMemo(
    () => allProducts.filter(p => p.isActive !== false).length,
    [allProducts],
  );

  const assignedProductIds = useMemo(
    () => new Set((allAccountProducts as any[]).map(ap => ap.productId).filter(Boolean)),
    [allAccountProducts],
  );
  const assignedCount = useMemo(
    () => allProducts.filter(p => assignedProductIds.has(p.id)).length,
    [allProducts, assignedProductIds],
  );

  // MTD from billableCharges
  const { mtdProductsSold, mtdRevenue } = useMemo(() => {
    if (!mtdCharges.length) return { mtdProductsSold: 0, mtdRevenue: 0 };
    const productIds = new Set(mtdCharges.map((c: any) => c.productId).filter(Boolean));
    const revenue = mtdCharges.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
    return { mtdProductsSold: productIds.size, mtdRevenue: revenue };
  }, [mtdCharges]);

  // ── Product Health checks (derived from products + accountProducts) ────────
  const healthData = useMemo(() => {
    const total = allProducts.length;
    const activeProducts = allProducts.filter(p => p.isActive !== false);

    // Products missing unit price (null or $0)
    const missingPricing = allProducts.filter(
      p => !p.unitPrice || Number(p.unitPrice) === 0,
    );

    // Products missing billing rules (no billingFrequency OR no pricingModel)
    const missingBillingRules = allProducts.filter(
      p => !p.billingFrequency || !p.pricingModel,
    );

    // Products missing proposal content (no invoiceDescription, headline, or customerDescription)
    const missingProposalTemplate = allProducts.filter(
      p => !p.invoiceDescription && !p.headline && !p.customerDescription,
    );

    // Products missing GL mapping
    const missingGl = allProducts.filter(p => !p.glCode);

    // Assigned to accounts but marked inactive
    const assignedButInactive = allProducts.filter(
      p => assignedProductIds.has(p.id) && p.isActive === false,
    );

    // Active products with no MTD charges (not sold this month) — uses mtdCharges productIds
    const soldThisMonthIds = new Set(
      mtdCharges.map((c: any) => c.productId).filter(Boolean),
    );
    const notSoldThisMonth = activeProducts.filter(p => !soldThisMonthIds.has(p.id));

    return {
      total,
      missingPricing,
      missingBillingRules,
      missingProposalTemplate,
      missingGl,
      assignedButInactive,
      notSoldThisMonth,
    };
  }, [allProducts, assignedProductIds, mtdCharges]);

  // ── Products Requiring Attention ──────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const sevenDaysAgo = daysAgo(7);
    const items: Array<{
      product: any;
      issue: string;
      issueIcon: React.ElementType;
      issueColor: string;
      priority: number;
    }> = [];

    const seen = new Set<string>();

    const push = (
      product: any,
      issue: string,
      issueIcon: React.ElementType,
      issueColor: string,
      priority: number,
    ) => {
      const key = `${product.id}:${issue}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ product, issue, issueIcon, issueColor, priority });
      }
    };

    // Assigned but inactive — critical
    healthData.assignedButInactive.forEach(p =>
      push(p, "Assigned to accounts but inactive", ZapOff, "#dc2626", 1),
    );

    // Missing pricing — critical
    healthData.missingPricing.filter(p => p.isActive !== false).forEach(p =>
      push(p, "Missing unit price", AlertCircle, "#dc2626", 2),
    );

    // Missing billing rules — warn
    healthData.missingBillingRules.filter(p => p.isActive !== false).slice(0, 5).forEach(p =>
      push(p, "Missing billing rules", AlertTriangle, "#f59e0b", 3),
    );

    // Missing GL mapping on active products — warn
    healthData.missingGl.filter(p => p.isActive !== false).slice(0, 5).forEach(p =>
      push(p, "Missing GL mapping", AlertTriangle, "#f59e0b", 4),
    );

    // Recently added (last 7 days)
    allProducts
      .filter(p => p.createdAt && new Date(p.createdAt) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .forEach(p => push(p, `Added ${fmtDate(p.createdAt)}`, Plus, "#0ea5e9", 5));

    // Recently modified (last 7 days, excluding just-created)
    allProducts
      .filter(p => {
        if (!p.updatedAt || !p.createdAt) return false;
        const updated = new Date(p.updatedAt);
        const created = new Date(p.createdAt);
        return updated >= sevenDaysAgo && Math.abs(updated.getTime() - created.getTime()) > 60_000;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .forEach(p => push(p, `Modified ${fmtDate(p.updatedAt)}`, Pencil, "#8b5cf6", 6));

    return items.sort((a, b) => a.priority - b.priority).slice(0, 20);
  }, [healthData, allProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-5 max-w-7xl">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 text-[#182039] dark:text-foreground">
            <Package className="h-5 w-5 text-primary" />
            Product Library
            <span className="text-muted-foreground font-normal">/ Dashboard</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Is my Product Library healthy and performing as expected?
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/products")}
            className="h-8 gap-1.5"
          >
            <Package className="h-3.5 w-3.5" />
            Product Library
          </Button>
        </div>
      </div>

      {/* ── Section 1: Executive Summary ─────────────────────────────────── */}
      <div>
        <SectionHeader
          num={1}
          title="Executive Summary"
          actionLabel="View All Products"
          actionHref="/admin/products"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <KpiCard
            title="Active Products"
            value={isLoading ? "—" : activeCount.toLocaleString()}
            subLabel={isLoading ? "" : `of ${allProducts.length.toLocaleString()} total`}
            href="/admin/products"
            isLoading={isLoading}
          />
          <KpiCard
            title="Assigned to Accounts"
            value={isLoading ? "—" : assignedCount.toLocaleString()}
            subLabel="products across all accounts"
            href="/admin/products"
            isLoading={isLoading}
          />
          <KpiCard
            title="Products Sold (MTD)"
            value={chargesLoading ? "—" : mtdProductsSold.toLocaleString()}
            subLabel={mtd.label}
            isLoading={chargesLoading}
          />
          <KpiCard
            title="Revenue by Products (MTD)"
            value={chargesLoading ? "—" : fmt$(mtdRevenue)}
            subLabel={mtd.label}
            isLoading={chargesLoading}
          />
          <UnavailableCard
            title="Gross Profit (MTD)"
            note="Requires cost-of-goods data. Not available in the current billing schema."
          />
          <UnavailableCard
            title="Pending Quotes"
            note="Requires a quote pipeline. No quotes table in the current schema."
          />
        </div>
      </div>

      {/* ── Section 2: Product Health ─────────────────────────────────────── */}
      <div>
        <SectionHeader num={2} title="Product Health" actionLabel="View All" actionHref="/admin/products" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <HealthCard
            title="Missing Pricing"
            count={healthData.missingPricing.length}
            total={healthData.total}
            href="/admin/products"
            accent={healthData.missingPricing.length > 0 ? "critical" : "ok"}
            icon={DollarSign}
            isLoading={isLoading}
          />
          <HealthCard
            title="Missing Billing Rules"
            count={healthData.missingBillingRules.length}
            total={healthData.total}
            href="/admin/products"
            accent={healthData.missingBillingRules.length > 0 ? "warn" : "ok"}
            icon={AlertTriangle}
            isLoading={isLoading}
          />
          <HealthCard
            title="Missing Proposal Template"
            count={healthData.missingProposalTemplate.length}
            total={healthData.total}
            href="/admin/products"
            accent={healthData.missingProposalTemplate.length > 0 ? "warn" : "ok"}
            icon={AlertCircle}
            isLoading={isLoading}
          />
          <HealthCard
            title="Missing GL Mapping"
            count={healthData.missingGl.length}
            total={healthData.total}
            href="/admin/products"
            accent={healthData.missingGl.length > 0 ? "warn" : "ok"}
            icon={AlertTriangle}
            isLoading={isLoading}
          />
          <HealthCard
            title="Assigned but Inactive"
            count={healthData.assignedButInactive.length}
            total={assignedCount}
            href="/admin/products"
            accent={healthData.assignedButInactive.length > 0 ? "critical" : "ok"}
            icon={ZapOff}
            isLoading={isLoading}
          />
          <HealthCard
            title="Not Sold This Month"
            count={healthData.notSoldThisMonth.length}
            total={allProducts.filter(p => p.isActive !== false).length}
            href="/admin/products"
            accent={healthData.notSoldThisMonth.length > 0 ? "warn" : "ok"}
            icon={TrendingUp}
            isLoading={isLoading || chargesLoading}
          />
        </div>
      </div>

      {/* ── Section 3: Products Requiring Attention ───────────────────────── */}
      <div>
        <SectionHeader
          num={3}
          title="Products Requiring Attention"
          actionLabel="View All"
          actionHref="/admin/products"
        />
        <Card className="border border-border/50 shadow-none">
          <CardHeader className="px-3 pt-3 pb-1.5">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Configuration issues · Recent changes · Deployment gaps
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            {isLoading ? (
              <div className="space-y-1.5 px-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : attentionItems.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
                <p className="text-sm font-medium text-foreground/60">All clear</p>
                <p className="text-xs text-muted-foreground">
                  No configuration issues or recent changes requiring attention.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {attentionItems.map((item, i) => (
                  <AttentionRow
                    key={`${item.product.id}-${i}`}
                    product={item.product}
                    issue={item.issue}
                    issueIcon={item.issueIcon}
                    issueColor={item.issueColor}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
