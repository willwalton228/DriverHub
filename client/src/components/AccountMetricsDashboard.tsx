import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Clock, CalendarClock, Activity } from "lucide-react";

interface AccountMetrics {
  activeAccounts: { count: number; ids: string[] };
  atRiskAccounts: { count: number; ids: string[] };
  pastDueAccounts: { count: number; ids: string[] };
  noActivityAccounts: { count: number; ids: string[] };
  contractsExpiringAccounts: { count: number; ids: string[] };
}

export type MetricFilter = 
  | "all" 
  | "active" 
  | "at-risk" 
  | "past-due" 
  | "no-activity" 
  | "contracts-expiring";

interface AccountMetricsDashboardProps {
  activeFilter: MetricFilter;
  onFilterChange: (filter: MetricFilter, ids: string[]) => void;
}

export function AccountMetricsDashboard({ activeFilter, onFilterChange }: AccountMetricsDashboardProps) {
  const { data: metrics, isLoading } = useQuery<AccountMetrics>({
    queryKey: ["/api/corporate/customers/metrics"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const tiles = [
    {
      id: "active" as MetricFilter,
      label: "Active Accounts",
      count: metrics.activeAccounts.count,
      ids: metrics.activeAccounts.ids,
      icon: CheckCircle2,
      colorClass: "text-emerald-600 dark:text-emerald-400",
      bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
      borderClass: "border-emerald-200 dark:border-emerald-800",
    },
    {
      id: "at-risk" as MetricFilter,
      label: "At-Risk Accounts",
      count: metrics.atRiskAccounts.count,
      ids: metrics.atRiskAccounts.ids,
      icon: AlertTriangle,
      colorClass: "text-amber-600 dark:text-amber-400",
      bgClass: "bg-amber-50 dark:bg-amber-950/30",
      borderClass: "border-amber-200 dark:border-amber-800",
    },
    {
      id: "past-due" as MetricFilter,
      label: "Past Due (AR)",
      count: metrics.pastDueAccounts.count,
      ids: metrics.pastDueAccounts.ids,
      icon: Clock,
      colorClass: "text-red-600 dark:text-red-400",
      bgClass: "bg-red-50 dark:bg-red-950/30",
      borderClass: "border-red-200 dark:border-red-800",
    },
    {
      id: "no-activity" as MetricFilter,
      label: "No Activity (30d)",
      count: metrics.noActivityAccounts.count,
      ids: metrics.noActivityAccounts.ids,
      icon: Activity,
      colorClass: "text-slate-600 dark:text-slate-400",
      bgClass: "bg-slate-50 dark:bg-slate-950/30",
      borderClass: "border-slate-200 dark:border-slate-800",
    },
    {
      id: "contracts-expiring" as MetricFilter,
      label: "Expiring (90d)",
      count: metrics.contractsExpiringAccounts.count,
      ids: metrics.contractsExpiringAccounts.ids,
      icon: CalendarClock,
      colorClass: "text-purple-600 dark:text-purple-400",
      bgClass: "bg-purple-50 dark:bg-purple-950/30",
      borderClass: "border-purple-200 dark:border-purple-800",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const isActive = activeFilter === tile.id;

        return (
          <Card
            key={tile.id}
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${
              isActive
                ? `ring-2 ring-primary ${tile.bgClass}`
                : "hover:shadow-md"
            }`}
            onClick={() => {
              if (isActive) {
                onFilterChange("all", []);
              } else {
                onFilterChange(tile.id, tile.ids);
              }
            }}
            data-testid={`metric-tile-${tile.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`p-1.5 rounded ${tile.bgClass}`}>
                  <Icon className={`h-4 w-4 ${tile.colorClass}`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">{tile.label}</p>
              <p className={`text-2xl font-bold ${tile.colorClass}`} data-testid={`metric-count-${tile.id}`}>
                {tile.count}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
