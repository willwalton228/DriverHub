/**
 * Ops Driver Productivity Widget
 * Shows top 5 drivers by move count over the last 30 days.
 * Clicking navigates to the Driver Operational Report.
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { User, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DriverRow {
  driver_name: string;
  moves: number;
  revenue: string;
  move_hours: string;
}

export function OpsDriverProductivityWidget({ title }: { title?: string }) {
  const [, navigate] = useLocation();

  const { data = [], isLoading } = useQuery<DriverRow[]>({
    queryKey: ["/api/ops-reporting/widgets/driver-productivity"],
    queryFn:  () => fetch("/api/ops-reporting/widgets/driver-productivity").then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const maxMoves = Math.max(...data.map(r => r.moves), 1);

  return (
    <div className="h-full flex flex-col gap-1 p-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last 30 Days · By Moves</p>
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No data for last 30 days</p>
      ) : data.map((row, i) => {
        const pct = (row.moves / maxMoves) * 100;
        return (
          <button
            key={row.driver_name}
            onClick={() => navigate("/reports/ops/drivers")}
            className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 transition-colors text-left w-full group"
          >
            <span className="text-xs text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
            <span className="text-xs font-medium truncate flex-1 max-w-[120px]">{row.driver_name}</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-foreground shrink-0">{row.moves}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
