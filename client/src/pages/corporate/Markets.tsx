import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Users, TrendingUp } from "lucide-react";

interface MarketSummary {
  name: string;
  activeDrivers: number;
  totalDrivers: number;
  tripCount: number;
  status: string;
}

export default function Markets() {
  const { data: markets = [], isLoading } = useQuery<MarketSummary[]>({
    queryKey: ["/api/corporate/markets"],
  });

  const totalActiveDrivers = markets.reduce((sum, m) => sum + m.activeDrivers, 0);
  const totalDrivers = markets.reduce((sum, m) => sum + m.totalDrivers, 0);
  const totalTrips = markets.reduce((sum, m) => sum + m.tripCount, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-markets-title">Markets</h1>
        <p className="text-muted-foreground mt-1">
          Overview of all markets and driver distribution
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Markets</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-markets">
              {markets.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active service areas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-drivers">
              {totalActiveDrivers} / {totalDrivers}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Moves</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-trips">
              {totalTrips.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completed moves</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Markets Overview</CardTitle>
          <CardDescription>Driver distribution and activity by market</CardDescription>
        </CardHeader>
        <CardContent>
          {markets.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No market data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Active Drivers</TableHead>
                  <TableHead className="text-right">Total Drivers</TableHead>
                  <TableHead className="text-right">Moves</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets.map((market) => (
                  <TableRow key={market.name} data-testid={`row-market-${market.name}`}>
                    <TableCell className="font-medium">{market.name}</TableCell>
                    <TableCell className="text-right">{market.activeDrivers}</TableCell>
                    <TableCell className="text-right">{market.totalDrivers}</TableCell>
                    <TableCell className="text-right">{market.tripCount.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={market.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
