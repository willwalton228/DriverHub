import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  LogIn,
  LogOut,
  Coffee,
  Play,
  Loader2,
  MapPin,
  Timer,
  Calendar,
  History,
  WifiOff,
  Wifi,
  CloudUpload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import useOfflineSchedule from "@/hooks/useOfflineSchedule";
import { format, formatDistanceToNow, differenceInMinutes, parseISO, startOfWeek, endOfWeek } from "date-fns";

interface TimeClockEvent {
  id: string;
  eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  timestamp: string;
  locationId?: string;
  notes?: string;
  location?: { name: string };
}

interface WorkLocation {
  id: string;
  name: string;
}

interface ClockStatus {
  isClockedIn: boolean;
  isOnBreak: boolean;
  lastEvent?: TimeClockEvent;
  todayTotalMinutes: number;
  weekTotalMinutes: number;
}

export default function TimeClock() {
  const { user, isAuthenticated } = useAuth();
  const offline = useOfflineSchedule(user?.id || null);
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: clockStatus, isLoading: statusLoading } = useQuery<ClockStatus>({
    queryKey: ["/api/scheduling/time-clock/status"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: locations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/scheduling/locations"],
    enabled: isAuthenticated,
  });

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

  const { data: recentEvents = [] } = useQuery<TimeClockEvent[]>({
    queryKey: ["/api/scheduling/time-clock", { startDate: format(weekStart, "yyyy-MM-dd"), endDate: format(weekEnd, "yyyy-MM-dd") }],
    enabled: isAuthenticated,
  });

  const clockMutation = useMutation({
    mutationFn: async (eventType: string) => {
      if (!offline.isOnline) {
        throw new Error("You are currently offline. Please use the Schedule page for offline clock actions tied to specific shifts.");
      }
      return await apiRequest("POST", "/api/scheduling/time-clock", {
        eventType,
        locationId: selectedLocation || null,
        notes: notes || null,
      });
    },
    onSuccess: (_, eventType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/time-clock/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/time-clock"] });
      setNotes("");
      
      const messages: Record<string, string> = {
        clock_in: "You have clocked in successfully.",
        clock_out: "You have clocked out successfully.",
        break_start: "Break started. Enjoy your break!",
        break_end: "Break ended. You're back on the clock.",
      };
      toast({ title: "Time Clock", description: messages[eventType] || "Event recorded." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record time", variant: "destructive" });
    },
  });

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "clock_in": return <LogIn className="h-4 w-4 text-green-500" />;
      case "clock_out": return <LogOut className="h-4 w-4 text-red-500" />;
      case "break_start": return <Coffee className="h-4 w-4 text-orange-500" />;
      case "break_end": return <Play className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "clock_in": return "Clocked In";
      case "clock_out": return "Clocked Out";
      case "break_start": return "Started Break";
      case "break_end": return "Ended Break";
      default: return eventType;
    }
  };

  const isClockedIn = clockStatus?.isClockedIn ?? false;
  const isOnBreak = clockStatus?.isOnBreak ?? false;

  return (
    <div className="space-y-6">
      {!offline.isOnline && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950" data-testid="alert-offline-banner-tc">
          <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Offline Mode</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Clock actions will be queued and synced when connection is restored.
          </AlertDescription>
        </Alert>
      )}

      {offline.pendingCount > 0 && (
        <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950" data-testid="alert-pending-sync-tc">
          <CloudUpload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">
            {offline.pendingCount} Pending Action{offline.pendingCount !== 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            {offline.isSyncing ? 'Syncing...' : offline.isOnline ? 'Will sync automatically' : 'Will sync when online'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-time-clock-title">Time Clock</h1>
          <p className="text-muted-foreground">Clock in, take breaks, and track your work hours</p>
        </div>
        <Badge 
          variant={offline.isOnline ? "secondary" : "destructive"} 
          className="text-xs"
          data-testid="badge-connection-status-tc"
        >
          {offline.isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
          {offline.isOnline ? "Online" : "Offline"}
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Current Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Badge 
                  className={`${
                    isOnBreak 
                      ? "bg-orange-500" 
                      : isClockedIn 
                      ? "bg-green-500" 
                      : "bg-gray-500"
                  } text-white`}
                >
                  {isOnBreak ? "On Break" : isClockedIn ? "Clocked In" : "Clocked Out"}
                </Badge>
                {clockStatus?.lastEvent && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Since {formatDistanceToNow(parseISO(clockStatus.lastEvent.timestamp), { addSuffix: true })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Today's Hours</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatMinutes(clockStatus?.todayTotalMinutes ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMinutes(clockStatus?.weekTotalMinutes ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Clock In / Out
            </CardTitle>
            <CardDescription>Record your work time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-6 bg-muted/50 rounded-lg">
              <div className="text-4xl font-bold font-mono" data-testid="text-current-time">
                {format(currentTime, "h:mm:ss a")}
              </div>
              <p className="text-muted-foreground mt-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
            </div>

            {locations.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="location">Work Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea 
                id="notes" 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes..." 
                data-testid="input-notes"
              />
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              {!isClockedIn ? (
                <Button 
                  size="lg" 
                  className="w-full bg-green-500 hover:bg-green-600"
                  onClick={() => clockMutation.mutate("clock_in")}
                  disabled={clockMutation.isPending}
                  data-testid="button-clock-in"
                >
                  {clockMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <LogIn className="h-5 w-5 mr-2" />
                  )}
                  Clock In
                </Button>
              ) : (
                <>
                  {!isOnBreak ? (
                    <>
                      <Button 
                        size="lg" 
                        variant="outline"
                        className="w-full border-orange-500 text-orange-500 hover:bg-orange-50"
                        onClick={() => clockMutation.mutate("break_start")}
                        disabled={clockMutation.isPending}
                        data-testid="button-start-break"
                      >
                        {clockMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                          <Coffee className="h-5 w-5 mr-2" />
                        )}
                        Start Break
                      </Button>
                      <Button 
                        size="lg" 
                        className="w-full bg-red-500 hover:bg-red-600"
                        onClick={() => clockMutation.mutate("clock_out")}
                        disabled={clockMutation.isPending}
                        data-testid="button-clock-out"
                      >
                        {clockMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                          <LogOut className="h-5 w-5 mr-2" />
                        )}
                        Clock Out
                      </Button>
                    </>
                  ) : (
                    <Button 
                      size="lg" 
                      className="w-full bg-blue-500 hover:bg-blue-600"
                      onClick={() => clockMutation.mutate("break_end")}
                      disabled={clockMutation.isPending}
                      data-testid="button-end-break"
                    >
                      {clockMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <Play className="h-5 w-5 mr-2" />
                      )}
                      End Break
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-orange-500" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your time clock entries this week</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No time clock entries this week</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentEvents.slice(0, 20).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="mt-0.5">{getEventIcon(event.eventType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{getEventLabel(event.eventType)}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(event.timestamp), "MMM d, h:mm a")}
                        </span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {event.location.name}
                        </div>
                      )}
                      {event.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{event.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
