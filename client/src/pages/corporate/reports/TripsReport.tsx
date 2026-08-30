import { useQuery } from "@tanstack/react-query";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { Search, Truck, ChevronRight, ArrowLeft, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Trip } from "@shared/schema";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";

export default function TripsReport() {
  const { filters } = useDashboardFilters();
  const [search, setSearch] = useState("");

  const { data: trips = [], isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/corporate/trips"],
    select: (data: any) => Array.isArray(data) ? data : (data?.trips ?? []),
  });

  const filteredTrips = useMemo(() => {
    let result = trips;

    if (filters.dateRange) {
      const now = new Date();
      let startDate: Date;
      
      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      result = result.filter(t => {
        if (!t.tripDate) return false;
        const tripDate = parseDateSafe(t.tripDate);
        return tripDate >= startDate;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t => 
        t.moveNumber?.toLowerCase().includes(s) ||
        t.origin?.toLowerCase().includes(s) ||
        t.destination?.toLowerCase().includes(s)
      );
    }

    return result.sort((a, b) => {
      const dateA = a.tripDate ?? "";
      const dateB = b.tripDate ?? "";
      return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
    });
  }, [trips, filters, search]);

  const statusCounts = useMemo(() => {
    return {
      completed: trips.filter(t => t.status === 'completed').length,
      in_progress: trips.filter(t => t.status === 'in_progress').length,
      scheduled: trips.filter(t => t.status === 'scheduled').length,
      cancelled: trips.filter(t => t.status === 'cancelled').length,
      total: trips.length,
    };
  }, [trips]);

  const getStatusColor = (status?: string | null) => getStatusBadgeClass(status ?? undefined);

  return (
    <div className="flex flex-col h-full">
      <DashboardFilterBar />
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Moves Report</h1>
            <p className="text-muted-foreground text-sm">Filtered move list with drill-down capability</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <Badge variant="outline">{statusCounts.total}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed</span>
                <Badge className="bg-green-500/10 text-green-600">{statusCounts.completed}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">In Progress</span>
                <Badge className="bg-blue-500/10 text-blue-600">{statusCounts.in_progress}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scheduled</span>
                <Badge className="bg-amber-500/10 text-amber-600">{statusCounts.scheduled}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cancelled</span>
                <Badge variant="destructive">{statusCounts.cancelled}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search trips by move number, origin, or destination..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-trips"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Move List
            </CardTitle>
            <CardDescription>
              Showing {filteredTrips.length} of {trips.length} moves
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredTrips.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No moves match the current filters</p>
            ) : (
              <div className="space-y-2">
                {filteredTrips.slice(0, 50).map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`}>
                    <div 
                      className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer group"
                      data-testid={`row-trip-${trip.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Truck className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            Move #{trip.moveNumber || 'N/A'}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[200px]">
                              {trip.origin || 'Unknown'} → {trip.destination || 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {trip.tripDate ? formatDate(trip.tripDate) : 'No date'}
                          </div>
                        </div>
                        <Badge className={`capitalize ${getStatusColor(trip.status)}`}>
                          {trip.status?.replace('_', ' ') || 'unknown'}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
                {filteredTrips.length > 50 && (
                  <p className="text-center text-muted-foreground py-2 text-sm">
                    Showing first 50 of {filteredTrips.length} moves
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
