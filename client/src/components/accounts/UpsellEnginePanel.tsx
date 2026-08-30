import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Users,
  Star,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  CircleDollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { cn } from "@/lib/utils";

type UpsellRecommendationType =
  | "price_increase"
  | "dedicated_driver"
  | "premium_window"
  | "re_engagement"
  | "volume_commitment";

type RecommendationPriority = "high" | "medium" | "low";
type RecommendationConfidence = "high" | "medium" | "low";

interface UpsellRecommendation {
  id: string;
  type: UpsellRecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  signals: string[];
  impactDollars: number;
  impactPercent: number;
  cta: string;
  confidence: RecommendationConfidence;
}

interface AccountUpsellData {
  customerId: string;
  generatedAt: string;
  recommendations: UpsellRecommendation[];
  dataQuality: {
    hasInvoices: boolean;
    hasWiwData: boolean;
    hasDrivers: boolean;
    invoiceMonths: number;
  };
}

const TYPE_CONFIG: Record<
  UpsellRecommendationType,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  price_increase:    { icon: TrendingUp,         label: "Price Increase" },
  dedicated_driver:  { icon: Users,              label: "Dedicated Drivers" },
  premium_window:    { icon: Star,               label: "Premium Window" },
  re_engagement:     { icon: RefreshCw,          label: "Re-engagement" },
  volume_commitment: { icon: FileText,           label: "Volume Contract" },
};

const PRIORITY_CONFIG: Record<RecommendationPriority, { label: string; className: string }> = {
  high:   { label: "High",   className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  medium: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" },
  low:    { label: "Low",    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
};

const CONFIDENCE_LABEL: Record<RecommendationConfidence, string> = {
  high:   "High confidence",
  medium: "Moderate confidence",
  low:    "Indicative estimate",
};

function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function RecommendationCard({ rec }: { rec: UpsellRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, label: typeLabel } = TYPE_CONFIG[rec.type];
  const { label: priorityLabel, className: priorityClass } = PRIORITY_CONFIG[rec.priority];
  const impactLabel =
    rec.type === "volume_commitment"
      ? `${formatDollars(rec.impactDollars)} guaranteed ACV`
      : rec.impactPercent >= 0
      ? `+${formatDollars(rec.impactDollars)} / yr (+${rec.impactPercent}%)`
      : `${formatDollars(rec.impactDollars)} locked ACV (${Math.abs(rec.impactPercent)}% discount)`;

  return (
    <div
      className="rounded-md border bg-card overflow-hidden"
      data-testid={`card-upsell-${rec.id}`}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate"
        data-testid={`btn-upsell-expand-${rec.id}`}
        aria-expanded={expanded}
      >
        {/* Icon */}
        <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>

        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">{rec.title}</span>
            <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium", priorityClass)}>
              {priorityLabel}
            </span>
            <Badge variant="outline" className="text-xs">
              {typeLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{rec.description.slice(0, 90)}…</p>
        </div>

        {/* Impact */}
        <div className="flex-shrink-0 text-right hidden sm:block">
          <p className="text-sm font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
            {impactLabel}
          </p>
          <p className="text-xs text-muted-foreground">{CONFIDENCE_LABEL[rec.confidence]}</p>
        </div>

        {/* Chevron */}
        <div className="flex-shrink-0 ml-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-4 space-y-4">
          {/* Impact callout */}
          <div className="flex items-start gap-3 rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2.5">
            <CircleDollarSign className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">{impactLabel}</p>
              <p className="text-xs text-green-600 dark:text-green-400">{CONFIDENCE_LABEL[rec.confidence]} — estimated impact</p>
            </div>
          </div>

          {/* Full description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{rec.description}</p>

          {/* Signals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Signals
            </p>
            <ul className="space-y-1">
              {rec.signals.map((s, i) => (
                <li key={i} className="text-xs text-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
            <Button size="sm" data-testid={`btn-upsell-cta-${rec.id}`}>
              {rec.cta}
            </Button>
            <p className="text-xs text-muted-foreground">
              All figures are estimates based on available account data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface UpsellEnginePanelProps {
  customerId: string;
}

export function UpsellEnginePanel({ customerId }: UpsellEnginePanelProps) {
  const { data, isLoading, isError } = useQuery<AccountUpsellData>({
    queryKey: ["/api/corporate/customers", customerId, "upsell-recommendations"],
    queryFn: () =>
      fetch(`/api/corporate/customers/${customerId}/upsell-recommendations`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card data-testid="card-upsell-engine">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Upsell Recommendations
          {data && data.recommendations.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {data.recommendations.length} opportunity{data.recommendations.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Unable to load recommendations. Try refreshing.
          </div>
        )}

        {data && data.recommendations.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No recommendations at this time. Thresholds not yet met based on current account data.
            </p>
            {!data.dataQuality.hasInvoices && (
              <p className="text-xs text-muted-foreground mt-1">
                Add invoice history to unlock more insights.
              </p>
            )}
          </div>
        )}

        {data && data.recommendations.length > 0 && (
          <>
            <div className="space-y-2">
              {data.recommendations.map(rec => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </div>

            {/* Data quality footer */}
            <div className="flex flex-wrap gap-3 pt-2 border-t">
              <DataQualityPill label="Invoice Data" active={data.dataQuality.hasInvoices} />
              <DataQualityPill label="WIW Labor Data" active={data.dataQuality.hasWiwData} />
              <DataQualityPill label="Driver Assignments" active={data.dataQuality.hasDrivers} />
              <span className="text-xs text-muted-foreground ml-auto self-center">
                Generated {new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DataQualityPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full border",
        active
          ? "border-green-300 text-green-700 bg-green-50 dark:border-green-700 dark:text-green-300 dark:bg-green-950/40"
          : "border-muted text-muted-foreground bg-muted/30"
      )}
      data-testid={`pill-data-quality-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {active ? "+" : "—"} {label}
    </span>
  );
}
