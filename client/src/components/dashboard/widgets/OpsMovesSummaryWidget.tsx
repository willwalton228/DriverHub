/**
 * Ops Moves Summary Widget
 * Shows a 4-tile KPI grid for move activity over the last 30 days.
 * Links to the full Operational Move Report for drill-down.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Truck, DollarSign, TrendingUp, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MoveKpi {
  total_moves: number;
  completed_moves: number;
  cancelled_moves: number;
  revenue: string;
  gross_profit: string;
  gross_margin_pct: string | null;
}

function fmt$(v: string | null | undefined) {
  if (v == null) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function OpsMovesSummaryWidget({ title }: { title?: string }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<MoveKpi>({
    queryKey: ["/api/ops-reporting/widgets/moves-kpi"],
    queryFn:  () => fetch("/api/ops-reporting/widgets/moves-kpi").then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const tiles = [
    { icon: Truck,         label: "Total Moves",  value: isLoading ? null : String(data?.total_moves     ?? 0), color: "text-blue-600",    bg: "bg-blue-50"    },
    { icon: CheckCircle2,  label: "Completed",    value: isLoading ? null : String(data?.completed_moves ?? 0), color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: DollarSign,    label: "Revenue",      value: isLoading ? null : fmt$(data?.revenue),                color: "text-emerald-700", bg: "bg-emerald-50" },
    { icon: TrendingUp,    label: "Gross Profit", value: isLoading ? null : fmt$(data?.gross_profit),           color: parseFloat(data?.gross_profit ?? "0") >= 0 ? "text-emerald-600" : "text-red-600", bg: "bg-muted" },
  ];

  return (
    <div className="h-full flex flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last 30 Days</p>
        {data?.gross_margin_pct && (
          <span className="text-xs text-muted-foreground">{parseFloat(data.gross_margin_pct).toFixed(1)}% margin</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 flex-1">
        {tiles.map(t => (
          <button
            key={t.label}
            onClick={() => navigate("/reports/ops/moves")}
            className={`flex flex-col items-start p-2.5 rounded-lg border ${t.bg} hover:opacity-90 transition-opacity text-left`}
          >
            <div className={`h-6 w-6 rounded flex items-center justify-center mb-1.5 bg-white/60`}>
              <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
            </div>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mb-0.5" />
            ) : (
              <p className={`text-base font-bold tabular-nums ${t.color}`}>{t.value}</p>
            )}
            <p className="text-xs text-muted-foreground">{t.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
