import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Truck, Users, Building2, Calendar, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/dateFormat";
import { EmailSummaryDialog } from "@/components/EmailSummaryDialog";

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardStats {
  total: number;
  statusCounts: { status: string; count: number }[];
  topDrivers: { driverId: string; driverName: string; moveCount: number }[];
  topCustomers: { customerId: string; customerName: string; moveCount: number }[];
  recentMoves: {
    id: string;
    moveNumber: string | null;
    status: string | null;
    tripDate: string | null;
    driverId: string | null;
    customerId: string | null;
    driverName: string | null;
    customerName: string | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStatusCount(statusCounts: { status: string; count: number }[], status: string): number {
  return statusCounts.find((s) => s.status === status)?.count ?? 0;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MovesDashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/corporate/trips/dashboard-stats"],
    staleTime: 60_000,
  });

  const total           = data?.total          ?? 0;
  const statusCounts    = data?.statusCounts   ?? [];
  const topDrivers      = data?.topDrivers     ?? [];
  const topCustomers    = data?.topCustomers   ?? [];
  const recentMoves     = data?.recentMoves    ?? [];

  const completedCount  = getStatusCount(statusCounts, "completed");
  const inProgressCount = getStatusCount(statusCounts, "in-progress");
  const scheduledCount  = getStatusCount(statusCounts, "scheduled");
  const cancelledCount  = getStatusCount(statusCounts, "cancelled");

  // Email summary built from server-aggregate data — no client-side filtering
  const summaryContent = `
MOVES SUMMARY
Total Moves: ${total}
Completed: ${completedCount}
In Progress: ${inProgressCount}
Scheduled: ${scheduledCount}
Cancelled: ${cancelledCount}

TOP DRIVERS (by moves):
${topDrivers.map((d, i) => `${i + 1}. ${d.driverName} - ${d.moveCount} moves`).join("\n")}

TOP CUSTOMERS (by moves):
${topCustomers.map((c, i) => `${i + 1}. ${c.customerName} - ${c.moveCount} moves`).join("\n")}

RECENT MOVES:
${recentMoves.map((m, i) => `${i + 1}. ${m.moveNumber ?? `Move #${m.id.slice(0, 8)}`} - ${m.driverName ?? "Unassigned"} (${m.status ?? "—"})`).join("\n")}
  `.trim();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Moves Dashboard</h1>
          <EmailSummaryDialog title="Moves" summaryContent={summaryContent} />
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Overview of all move operations and logistics
        </p>
      </div>

      {/* Summary Bar */}
      <div data-testid="moves-summary-bar" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/trips">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Moves</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <span className="block h-7 w-16 bg-muted animate-pulse rounded" /> : total.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Click to view all</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Truck className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? <span className="block h-7 w-12 bg-muted animate-pulse rounded" /> : completedCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Successfully completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Truck className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {isLoading ? <span className="block h-7 w-12 bg-muted animate-pulse rounded" /> : inProgressCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {isLoading ? <span className="block h-7 w-12 bg-muted animate-pulse rounded" /> : scheduledCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Upcoming moves</p>
          </CardContent>
        </Card>
      </div>

      {/* Moves Workspace */}
      <h2 className="text-lg font-bold mb-3" data-testid="text-moves-workspace-header">Moves Workspace</h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top Drivers by Moves
            </CardTitle>
            <CardDescription>Most active drivers (all time)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : topDrivers.filter((d) => d.moveCount > 0).length > 0 ? (
              <div className="space-y-3">
                {topDrivers.filter((d) => d.moveCount > 0).map(({ driverId, driverName, moveCount }, index) => (
                  <Link key={driverId} href={`/drivers/${driverId}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <p className="font-medium">{driverName}</p>
                      </div>
                      <Badge>{moveCount.toLocaleString()} moves</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No move data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Customers by Moves
            </CardTitle>
            <CardDescription>Most active customers (all time)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : topCustomers.filter((c) => c.moveCount > 0).length > 0 ? (
              <div className="space-y-3">
                {topCustomers.filter((c) => c.moveCount > 0).map(({ customerId, customerName, moveCount }, index) => (
                  <Link key={customerId} href={`/customers/${customerId}`}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <p className="font-medium">{customerName}</p>
                      </div>
                      <Badge>{moveCount.toLocaleString()} moves</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No customer move data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Status Breakdown
            </CardTitle>
            <CardDescription>Moves by status (all time)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded-lg border">
                  <span>Completed</span>
                  <Badge>{completedCount.toLocaleString()}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg border">
                  <span>In Progress</span>
                  <Badge variant="secondary">{inProgressCount.toLocaleString()}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg border">
                  <span>Scheduled</span>
                  <Badge variant="outline">{scheduledCount.toLocaleString()}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg border">
                  <span>Cancelled</span>
                  <Badge variant="destructive">{cancelledCount.toLocaleString()}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Moves — intentionally limited to 10 most recent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recent Moves
          </CardTitle>
          <CardDescription>10 most recent moves</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : recentMoves.length === 0 ? (
            <p className="text-muted-foreground text-sm">No move data available</p>
          ) : (
            <div className="space-y-3">
              {recentMoves.map((move) => (
                <Link key={move.id} href={`/trips/${move.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                    <div>
                      <p className="font-medium">{move.moveNumber ?? `Move #${move.id.slice(0, 8)}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {move.driverName ?? "Unassigned"}{move.customerName ? ` · ${move.customerName}` : ""}
                      </p>
                      {move.tripDate && (
                        <p className="text-xs text-muted-foreground">{formatDate(move.tripDate)}</p>
                      )}
                    </div>
                    <StatusBadge status={move.status ?? "scheduled"} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
