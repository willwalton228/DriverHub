/**
 * Ops Top Accounts Widget
 * Shows top 5 accounts by revenue over the last 30 days.
 * Clicking navigates to the Account Operational Report.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountRow {
  account_name: string;
  moves: number;
  revenue: string;
}

function fmt$(v: string | null | undefined) {
  const n = parseFloat(v ?? "0");
  if (!n) return "—";
  return n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n.toFixed(0)}`;
}

export function OpsTopAccountsWidget({ title }: { title?: string }) {
  const [, navigate] = useLocation();

  const { data = [], isLoading } = useQuery<AccountRow[]>({
    queryKey: ["/api/ops-reporting/widgets/top-accounts"],
    queryFn:  () => fetch("/api/ops-reporting/widgets/top-accounts").then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const maxRevenue = Math.max(...data.map(r => parseFloat(r.revenue)), 1);

  return (
    <div className="h-full flex flex-col gap-1 p-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last 30 Days</p>
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No data for last 30 days</p>
      ) : data.map((row, i) => {
        const pct = (parseFloat(row.revenue) / maxRevenue) * 100;
        return (
          <button
            key={row.account_name}
            onClick={() => navigate("/reports/ops/accounts")}
            className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 transition-colors text-left w-full group"
          >
            <span className="text-xs text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
            <span className="text-xs font-medium truncate flex-1 max-w-[120px]">{row.account_name}</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-emerald-700 shrink-0">{fmt$(row.revenue)}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
