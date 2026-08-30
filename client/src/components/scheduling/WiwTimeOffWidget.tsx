/**
 * WiwTimeOffWidget — shared "Drivers with Most Time Off" dashboard card.
 * Used on both the Scheduling Dashboard and the Drivers Dashboard.
 * Clicking "View Full Report" navigates to the Scheduling Reports library.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, AlertCircle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { createReportSessionHref } from "@/components/scheduling/SchedulingReportSession";

interface TimeOffRow {
  rank: number;
  driverId: string;
  driverName: string;
  totalApprovedDays: number;
  totalApprovedHours: number | null;
  totalRequests: number;
}

type Period = "60d" | "ytd";

interface WiwTimeOffWidgetProps {
  className?: string;
  /** Keep the dashboard version compact without changing the shared Drivers dashboard card. */
  limit?: number;
  compact?: boolean;
}

interface FilterValues {
  networks: string[];
  accounts: Array<{ id: string; name: string; network: string | null }>;
}

const PERIOD_LABELS: Record<Period, string> = {
  "60d": "Last 60 Days",
  "ytd": "Current Year",
};

export function WiwTimeOffWidget({ className, limit = 10, compact = false }: WiwTimeOffWidgetProps) {
  const [period, setPeriod] = useState<Period>("60d");
  const [networkIds, setNetworkIds] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [driverClass, setDriverClass] = useState("all");

  const filterQuery = useQuery<FilterValues>({
    queryKey: ["/api/wiw/time-off/filter-values"],
    staleTime: 10 * 60 * 1000,
  });

  const summaryParams = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (networkIds.length) params.set("networks", networkIds.join(","));
    if (accountIds.length) params.set("accountIds", accountIds.join(","));
    if (driverClass !== "all") params.set("driverClass", driverClass);
    return params.toString();
  }, [period, networkIds, accountIds, driverClass]);

  const { data, isLoading, isError } = useQuery<TimeOffRow[]>({
    queryKey: ["/api/wiw/time-off/summary", summaryParams],
    queryFn: async () => {
      const res = await fetch(`/api/wiw/time-off/summary?${summaryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time-off summary");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = data ?? [];
  const accountOptions = (filterQuery.data?.accounts ?? [])
    .filter((account) => networkIds.length === 0 || (account.network && networkIds.includes(account.network)))
    .map((account) => ({ value: account.id, label: account.name }));
  const hasActiveFilters = period !== "60d" || networkIds.length > 0 || accountIds.length > 0 || driverClass !== "all";
  const reportHref = useMemo(
    () => createReportSessionHref(`/scheduling/reports/time-off?${summaryParams}`),
    [summaryParams],
  );

  useEffect(() => {
    const availableAccountIds = new Set(accountOptions.map((account) => account.value));
    setAccountIds((selected) => selected.filter((id) => availableAccountIds.has(id)));
  }, [filterQuery.data?.accounts, networkIds.join(",")]);

  function clearFilters() {
    setPeriod("60d");
    setNetworkIds([]);
    setAccountIds([]);
    setDriverClass("all");
  }

  return (
    <Card className={cn("flex flex-col", className)} data-testid="wiw-time-off-widget">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Drivers with Most Time Off
            </CardTitle>
            <CardDescription className="mt-0.5">
              Ranked by approved days off
            </CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            {(["60d", "ytd"] as Period[]).map(p => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                className="h-7 text-xs px-2"
                onClick={() => setPeriod(p)}
                data-testid={`btn-time-off-period-${p}`}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
        {!compact && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Networks"
              options={(filterQuery.data?.networks ?? []).map((network) => ({ value: network, label: network }))}
              selected={networkIds}
              onChange={setNetworkIds}
              placeholder="All Networks"
              className="h-8 text-xs"
              data-testid="filter-time-off-widget-networks"
            />
            <MultiSelectFilter
              label="Accounts / Dealerships"
              options={accountOptions}
              selected={accountIds}
              onChange={setAccountIds}
              placeholder="All Accounts"
              className="h-8 text-xs"
              data-testid="filter-time-off-widget-accounts"
            />
            <Select value={driverClass} onValueChange={setDriverClass}>
              <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-time-off-widget-driver-class">
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="Employee">Employee</SelectItem>
                <SelectItem value="Independent Contractor">Independent Contractor</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={clearFilters}
                data-testid="btn-time-off-widget-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <AlertCircle className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Could not load time-off data</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <p className="text-sm font-medium text-muted-foreground">No time-off data</p>
            <p className="text-xs text-muted-foreground/70">
              {period === "60d" ? "No requests in the last 60 days" : "No requests this calendar year"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="time-off-widget-table">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                  <th className="px-3 py-2 font-medium w-8">#</th>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium text-right">Days</th>
                  <th className="px-3 py-2 font-medium text-right">Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Requests</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(row => (
                  <tr
                    key={row.driverId}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    data-testid={`time-off-row-${row.driverId}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.rank === 1 ? (
                        <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <span className="text-xs">{row.rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/drivers/${row.driverId}?tab=scheduling`}>
                        <span className="font-medium hover:underline cursor-pointer text-primary">
                          {row.driverName}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {row.totalApprovedDays.toFixed(1)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                      {row.totalApprovedHours != null ? row.totalApprovedHours.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {row.totalRequests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/10 flex items-center justify-end">
        <Link href={reportHref}>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="btn-time-off-view-report">
            View Full Report <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
