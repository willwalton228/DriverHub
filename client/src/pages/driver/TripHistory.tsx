import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Loader2, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function TripHistory() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: trips = [], isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/drivers/trips"],
    enabled: isAuthenticated,
  });

  const filteredTrips = trips.filter((trip) => {
    const matchesSearch =
      searchTerm === "" ||
      trip.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.destination.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || trip.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalDistance = trips.reduce((sum, trip) => sum + Number(trip.distance || 0), 0);
  const completedTrips = trips.filter((trip) => trip.status === "completed").length;

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Move History</h1>
        <p className="text-muted-foreground mt-1">
          View your legacy move data and delivery records
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Moves</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-trips">
              {trips.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-trips">
              {completedTrips}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Successful deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-distance">
              {totalDistance.toFixed(0)} mi
            </div>
            <p className="text-xs text-muted-foreground mt-1">Miles traveled</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Moves</CardTitle>
          <CardDescription>Browse and filter your move history</CardDescription>
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Input
                  placeholder="Search by origin or destination..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="sm:max-w-sm"
                  data-testid="input-search-trips"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Search Options:</p>
                <ul className="text-sm space-y-0.5">
                  <li>• Origin location</li>
                  <li>• Destination location</li>
                </ul>
              </TooltipContent>
            </Tooltip>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrips.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {trips.length === 0 ? "No moves found" : "No moves match your filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTrips.map((trip, index) => (
                <div
                  key={trip.id}
                  className="border border-border rounded-lg p-4 hover-elevate"
                  data-testid={`card-trip-${index}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{trip.origin}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{trip.destination}</span>
                        <Badge
                          variant={
                            trip.status === "completed"
                              ? "default"
                              : trip.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                          data-testid={`badge-status-${index}`}
                        >
                          {trip.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(trip.tripDate)}
                        </span>
                        {trip.distance && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {Number(trip.distance).toFixed(1)} miles
                          </span>
                        )}
                        {trip.duration && <span>{trip.duration}</span>}
                      </div>
                      {trip.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{trip.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
