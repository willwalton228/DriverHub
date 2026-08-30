import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfWeek, endOfWeek, addDays, isToday, isTomorrow, isPast, isFuture } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Calendar, Clock, MapPin, Loader2, Check, ChevronLeft, ChevronRight,
  AlertCircle, RefreshCw, User, CalendarDays, Play, Square, Timer,
  Navigation, AlertTriangle, Shield, Coffee, TrendingUp, Activity,
  WifiOff, Wifi, CloudUpload, CloudOff
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import useOfflineSchedule from "@/hooks/useOfflineSchedule";

type AssignmentStatus = 'assigned' | 'confirmed' | 'declined' | 'cancelled' | 'no_show' | 'in_progress' | 'completed';

interface ShiftAssignment {
  id: string;
  shiftId: string;
  status: AssignmentStatus;
  assignedAt: string;
  confirmedAt: string | null;
  clockInTime: string | null;
  clockOutTime: string | null;
  notes: string | null;
  shift?: {
    id: string;
    name: string | null;
    startTime: string;
    endTime: string;
    role: string | null;
    locationId: string | null;
    color: string | null;
    schedule?: {
      id: string;
      name: string;
      status: string;
    };
    location?: {
      id: string;
      name: string;
      address: string | null;
    };
  };
}

const statusConfig: Record<AssignmentStatus, { label: string; color: string; icon: typeof Check }> = {
  assigned: { label: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300", icon: AlertCircle },
  confirmed: { label: "Confirmed", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300", icon: Check },
  declined: { label: "Declined", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300", icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300", icon: AlertCircle },
  no_show: { label: "Missed", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300", icon: AlertCircle },
  in_progress: { label: "Working", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300", icon: Timer },
  completed: { label: "Completed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300", icon: Check },
};

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const config = statusConfig[status] || statusConfig.assigned;
  const Icon = config.icon;
  
  return (
    <Badge className={cn("gap-1", config.color)} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function formatShiftTime(startTime: string, endTime: string) {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

function formatShiftDate(startTime: string) {
  const date = parseISO(startTime);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function getShiftDuration(startTime: string, endTime: string) {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return `${hours.toFixed(1)} hrs`;
}

interface GeofenceState {
  isLoading: boolean;
  coords: { latitude: number; longitude: number } | null;
  error: string | null;
  violation: boolean;
  distance: number | null;
}

export default function DriverSchedule() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const offline = useOfflineSchedule(user?.id || null);
  const [selectedAssignment, setSelectedAssignment] = useState<ShiftAssignment | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Geofencing state
  const [geofenceState, setGeofenceState] = useState<GeofenceState>({
    isLoading: false,
    coords: null,
    error: null,
    violation: false,
    distance: null,
  });
  const [showGeofenceOverride, setShowGeofenceOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingClockAction, setPendingClockAction] = useState<'in' | 'out' | null>(null);
  
  const getCurrentLocation = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }, []);

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

  const currentWeekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 0 });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 });

  const startDateStr = format(currentWeekStart, "yyyy-MM-dd");
  const endDateStr = format(currentWeekEnd, "yyyy-MM-dd");

  const { data: assignments = [], isLoading, refetch, isFetching } = useQuery<ShiftAssignment[]>({
    queryKey: ["/api/scheduling/my-schedule", startDateStr, endDateStr],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/my-schedule?startDate=${startDateStr}&endDate=${endDateStr}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch schedule");
      const data = await res.json();
      if (user?.id) {
        offline.cacheSchedule(startDateStr, endDateStr, data);
      }
      return data;
    },
    placeholderData: () => {
      if (!offline.isOnline && user?.id) {
        const cached = offline.getCachedSchedule(startDateStr, endDateStr);
        return cached?.data || [];
      }
      return undefined;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  // Weekly summary for hours transparency
  const { data: weeklySummary, isLoading: summaryLoading, isError: summaryError, refetch: summaryRefetch } = useQuery<{
    weekStart: string;
    weekEnd: string;
    scheduledHours: number;
    actualHours: number;
    remainingBeforeOT: number;
    otThreshold: number;
    breakCompliance: { eligible: number; taken: number; overdue: number; status: 'compliant' | 'at_risk' | 'violation' };
    upcomingShifts: Array<{ id: string; date: string; startTime: string; endTime: string; location: string | null; hours: number }>;
  }>({
    queryKey: ["/api/scheduling/weekly-summary", startDateStr],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/weekly-summary?weekStart=${startDateStr}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch weekly summary");
      return res.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const acknowledgeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/scheduling/assignments/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/my-schedule"] });
      toast({ title: "Shift confirmed successfully" });
      setSelectedAssignment(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async ({ id, latitude, longitude, overrideReason }: { 
      id: string; 
      latitude?: number; 
      longitude?: number;
      overrideReason?: string;
    }) => {
      const res = await apiRequest("POST", `/api/scheduling/assignments/${id}/clock-in`, {
        latitude,
        longitude,
        overrideReason,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/my-schedule"] });
      toast({ title: "Clocked in successfully", description: `Started at ${format(new Date(), 'h:mm a')}` });
      if (data) {
        setSelectedAssignment(prev => prev ? { ...prev, status: 'in_progress', clockInTime: new Date().toISOString() } : null);
      }
      resetGeofenceState();
    },
    onError: (error: any) => {
      if (error.message?.includes('GEOFENCE_VIOLATION')) {
        const match = error.message.match(/distance: ([\d.]+)m/);
        const distance = match ? parseFloat(match[1]) : null;
        setGeofenceState(prev => ({
          ...prev,
          violation: true,
          distance,
        }));
        setPendingClockAction('in');
        setShowGeofenceOverride(true);
      } else {
        toast({ title: "Clock-in failed", description: error.message, variant: "destructive" });
      }
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async ({ id, latitude, longitude, overrideReason }: { 
      id: string; 
      latitude?: number; 
      longitude?: number;
      overrideReason?: string;
    }) => {
      const res = await apiRequest("POST", `/api/scheduling/assignments/${id}/clock-out`, {
        latitude,
        longitude,
        overrideReason,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/my-schedule"] });
      toast({ title: "Clocked out successfully", description: `Ended at ${format(new Date(), 'h:mm a')}` });
      setSelectedAssignment(null);
      resetGeofenceState();
    },
    onError: (error: any) => {
      if (error.message?.includes('GEOFENCE_VIOLATION')) {
        const match = error.message.match(/distance: ([\d.]+)m/);
        const distance = match ? parseFloat(match[1]) : null;
        setGeofenceState(prev => ({
          ...prev,
          violation: true,
          distance,
        }));
        setPendingClockAction('out');
        setShowGeofenceOverride(true);
      } else {
        toast({ title: "Clock-out failed", description: error.message, variant: "destructive" });
      }
    },
  });
  
  const resetGeofenceState = () => {
    setGeofenceState({
      isLoading: false,
      coords: null,
      error: null,
      violation: false,
      distance: null,
    });
    setShowGeofenceOverride(false);
    setOverrideReason("");
    setPendingClockAction(null);
  };
  
  const handleClockIn = async (assignmentId: string) => {
    if (!offline.isOnline) {
      offline.queueClockAction({
        assignmentId,
        actionType: 'clock_in',
        timestamp: new Date().toISOString(),
      });
      setSelectedAssignment(prev => prev ? { ...prev, status: 'in_progress' as AssignmentStatus } : null);
      return;
    }
    setGeofenceState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const position = await getCurrentLocation();
      const { latitude, longitude } = position.coords;
      setGeofenceState(prev => ({ ...prev, coords: { latitude, longitude }, isLoading: false }));
      clockInMutation.mutate({ id: assignmentId, latitude, longitude });
    } catch (error: any) {
      setGeofenceState(prev => ({ ...prev, isLoading: false, error: error.message }));
      toast({
        title: "Location access required",
        description: "Please enable location services to clock in",
        variant: "destructive",
      });
    }
  };
  
  const handleClockOut = async (assignmentId: string) => {
    if (!offline.isOnline) {
      offline.queueClockAction({
        assignmentId,
        actionType: 'clock_out',
        timestamp: new Date().toISOString(),
      });
      setSelectedAssignment(null);
      return;
    }
    setGeofenceState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const position = await getCurrentLocation();
      const { latitude, longitude } = position.coords;
      setGeofenceState(prev => ({ ...prev, coords: { latitude, longitude }, isLoading: false }));
      clockOutMutation.mutate({ id: assignmentId, latitude, longitude });
    } catch (error: any) {
      setGeofenceState(prev => ({ ...prev, isLoading: false, error: error.message }));
      toast({
        title: "Location access required",
        description: "Please enable location services to clock out",
        variant: "destructive",
      });
    }
  };
  
  const handleGeofenceOverride = () => {
    if (!selectedAssignment || !overrideReason.trim() || !geofenceState.coords) return;
    
    const { latitude, longitude } = geofenceState.coords;
    if (pendingClockAction === 'in') {
      clockInMutation.mutate({ 
        id: selectedAssignment.id, 
        latitude, 
        longitude, 
        overrideReason: overrideReason.trim() 
      });
    } else if (pendingClockAction === 'out') {
      clockOutMutation.mutate({ 
        id: selectedAssignment.id, 
        latitude, 
        longitude, 
        overrideReason: overrideReason.trim() 
      });
    }
    setShowGeofenceOverride(false);
  };

  const upcomingShifts = assignments
    .filter(a => a.shift && isFuture(parseISO(a.shift.startTime)))
    .sort((a, b) => new Date(a.shift!.startTime).getTime() - new Date(b.shift!.startTime).getTime());

  const pastShifts = assignments
    .filter(a => a.shift && isPast(parseISO(a.shift.endTime)))
    .sort((a, b) => new Date(b.shift!.startTime).getTime() - new Date(a.shift!.startTime).getTime());

  const pendingCount = assignments.filter(a => a.status === 'assigned').length;
  const confirmedCount = assignments.filter(a => a.status === 'confirmed').length;
  const totalHours = assignments.reduce((sum, a) => {
    if (!a.shift) return sum;
    const start = parseISO(a.shift.startTime);
    const end = parseISO(a.shift.endTime);
    return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }, 0);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {!offline.isOnline && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950" data-testid="alert-offline-banner">
          <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Offline Mode</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Viewing cached schedule. Clock actions will be queued and synced when connection is restored.
          </AlertDescription>
        </Alert>
      )}

      {offline.pendingCount > 0 && (
        <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950" data-testid="alert-pending-sync">
          <CloudUpload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">
            {offline.pendingCount} Pending Action{offline.pendingCount !== 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300 flex items-center gap-2 flex-wrap">
            <span>
              {offline.isSyncing ? 'Syncing...' : offline.isOnline ? 'Will sync automatically' : 'Will sync when online'}
            </span>
            {offline.isOnline && !offline.isSyncing && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => offline.syncPendingActions()}
                data-testid="button-sync-now"
              >
                <CloudUpload className="h-3 w-3 mr-1" />
                Sync Now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-schedule-title">My Schedule</h1>
          <p className="text-sm text-muted-foreground">View and confirm your assigned shifts</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge 
            variant={offline.isOnline ? "secondary" : "destructive"} 
            className="text-xs"
            data-testid="badge-connection-status"
          >
            {offline.isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {offline.isOnline ? "Online" : "Offline"}
          </Badge>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-schedule"
          >
            <RefreshCw className={cn("h-5 w-5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-primary" data-testid="text-upcoming-count">{upcomingShifts.length}</div>
            <div className="text-xs text-muted-foreground">Upcoming</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-pending-count">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-hours-count">{totalHours.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Hours</div>
          </CardContent>
        </Card>
      </div>

      {summaryError ? (
        <div className="flex items-center gap-2 py-2 text-sm" data-testid="error-weekly-summary">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to load weekly summary.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => summaryRefetch()}>Retry</Button>
        </div>
      ) : summaryLoading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground" data-testid="loading-weekly-summary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading weekly summary…
        </div>
      ) : weeklySummary ? (
        <Card data-testid="card-weekly-summary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Weekly Hours Summary
            </CardTitle>
            <CardDescription>Your workload transparency for this week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Scheduled Hours</div>
                <div className="text-xl font-bold" data-testid="text-scheduled-hours">{weeklySummary.scheduledHours}h</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Actual Hours</div>
                <div className="text-xl font-bold" data-testid="text-actual-hours">{weeklySummary.actualHours}h</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hours until Overtime</span>
                <span className={cn(
                  "font-medium",
                  weeklySummary.remainingBeforeOT <= 5 ? "text-red-600 dark:text-red-400" :
                  weeklySummary.remainingBeforeOT <= 10 ? "text-yellow-600 dark:text-yellow-400" :
                  "text-green-600 dark:text-green-400"
                )} data-testid="text-remaining-ot">
                  {weeklySummary.remainingBeforeOT}h remaining
                </span>
              </div>
              <Progress 
                value={Math.min((weeklySummary.actualHours / weeklySummary.otThreshold) * 100, 100)} 
                className={cn(
                  "h-2",
                  weeklySummary.actualHours >= weeklySummary.otThreshold && "[&>div]:bg-red-500"
                )}
                data-testid="progress-ot-hours"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0h</span>
                <span>{weeklySummary.otThreshold}h (OT threshold)</span>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Break Compliance</span>
              </div>
              <Badge 
                className={cn(
                  weeklySummary.breakCompliance.status === 'compliant' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
                  weeklySummary.breakCompliance.status === 'at_risk' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
                  weeklySummary.breakCompliance.status === 'violation' && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                )}
                data-testid="badge-break-status"
              >
                {weeklySummary.breakCompliance.status === 'compliant' && 'Compliant'}
                {weeklySummary.breakCompliance.status === 'at_risk' && 'At Risk'}
                {weeklySummary.breakCompliance.status === 'violation' && 'Violation'}
              </Badge>
            </div>
            {weeklySummary.breakCompliance.overdue > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  You have {weeklySummary.breakCompliance.overdue} overdue break(s). Please take required breaks.
                </AlertDescription>
              </Alert>
            )}

            {weeklySummary.upcomingShifts.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Upcoming Shifts ({weeklySummary.upcomingShifts.length})
                  </div>
                  <div className="space-y-2">
                    {weeklySummary.upcomingShifts.slice(0, 3).map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded" data-testid={`shift-preview-${shift.id}`}>
                        <div>
                          <div className="font-medium">{format(parseISO(shift.date), "EEE, MMM d")}</div>
                          <div className="text-xs text-muted-foreground">{shift.startTime} - {shift.endTime}</div>
                        </div>
                        <Badge variant="outline">{shift.hours}h</Badge>
                      </div>
                    ))}
                    {weeklySummary.upcomingShifts.length > 3 && (
                      <div className="text-xs text-center text-muted-foreground">
                        +{weeklySummary.upcomingShifts.length - 3} more shifts
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setWeekOffset(w => w - 1)}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center flex-1">
              <CardTitle className="text-base" data-testid="text-week-range">
                {format(currentWeekStart, "MMM d")} - {format(currentWeekEnd, "MMM d, yyyy")}
              </CardTitle>
              <CardDescription>
                {weekOffset === 0 ? "This Week" : weekOffset > 0 ? `+${weekOffset} weeks` : `${weekOffset} weeks`}
              </CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setWeekOffset(w => w + 1)}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {assignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No shifts scheduled</p>
              <p className="text-sm">You don't have any shifts this week</p>
            </div>
          ) : (
            <ScrollArea className="h-auto max-h-[400px]">
              <div className="space-y-3">
                {assignments
                  .filter(a => a.shift)
                  .sort((a, b) => new Date(a.shift!.startTime).getTime() - new Date(b.shift!.startTime).getTime())
                  .map((assignment) => (
                  <Card 
                    key={assignment.id}
                    className={cn(
                      "cursor-pointer hover-elevate transition-all",
                      assignment.status === 'assigned' && "border-yellow-500/50",
                      isPast(parseISO(assignment.shift!.endTime)) && "opacity-60"
                    )}
                    onClick={() => setSelectedAssignment(assignment)}
                    data-testid={`card-shift-${assignment.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold truncate" data-testid={`text-shift-name-${assignment.id}`}>
                              {assignment.shift?.name || assignment.shift?.role || "Shift"}
                            </span>
                            <StatusBadge status={assignment.status} />
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span data-testid={`text-shift-date-${assignment.id}`}>{formatShiftDate(assignment.shift!.startTime)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span data-testid={`text-shift-time-${assignment.id}`}>
                              {formatShiftTime(assignment.shift!.startTime, assignment.shift!.endTime)}
                            </span>
                            <span className="text-xs">({getShiftDuration(assignment.shift!.startTime, assignment.shift!.endTime)})</span>
                          </div>
                          {assignment.shift?.location && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate" data-testid={`text-shift-location-${assignment.id}`}>
                                {assignment.shift.location.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <div 
                          className="w-2 h-full min-h-[60px] rounded-full"
                          style={{ backgroundColor: assignment.shift?.color || '#6366f1' }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {pendingCount > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800 dark:text-yellow-300" data-testid="text-pending-alert">
                  {pendingCount} shift{pendingCount > 1 ? 's' : ''} pending confirmation
                </p>
                <p className="text-sm text-yellow-700/80 dark:text-yellow-400/80">
                  Tap on a shift to view details and confirm
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedAssignment} onOpenChange={(open) => !open && setSelectedAssignment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-shift-name">
              {selectedAssignment?.shift?.name || selectedAssignment?.shift?.role || "Shift Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedAssignment?.shift?.schedule?.name || "Schedule details"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedAssignment && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedAssignment.status} />
                {selectedAssignment.shift?.role && (
                  <Badge variant="outline">{selectedAssignment.shift.role}</Badge>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium" data-testid="text-detail-date">
                      {selectedAssignment.shift && format(parseISO(selectedAssignment.shift.startTime), "EEEE, MMMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">Date</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium" data-testid="text-detail-time">
                      {selectedAssignment.shift && formatShiftTime(selectedAssignment.shift.startTime, selectedAssignment.shift.endTime)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Duration: {selectedAssignment.shift && getShiftDuration(selectedAssignment.shift.startTime, selectedAssignment.shift.endTime)}
                    </p>
                  </div>
                </div>

                {selectedAssignment.shift?.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium" data-testid="text-detail-location">{selectedAssignment.shift.location.name}</p>
                      {selectedAssignment.shift.location.address && (
                        <p className="text-sm text-muted-foreground">{selectedAssignment.shift.location.address}</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedAssignment.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">Notes</p>
                      <p className="text-sm text-muted-foreground" data-testid="text-detail-notes">{selectedAssignment.notes}</p>
                    </div>
                  </>
                )}

                {selectedAssignment.confirmedAt && !selectedAssignment.clockInTime && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    Confirmed on {format(parseISO(selectedAssignment.confirmedAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                )}

                {selectedAssignment.clockInTime && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Clocked In:</span>
                      <span className="font-medium text-green-600 dark:text-green-400" data-testid="text-clock-in-time">
                        {format(parseISO(selectedAssignment.clockInTime), "h:mm a")}
                      </span>
                    </div>
                    {selectedAssignment.clockOutTime && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Clocked Out:</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400" data-testid="text-clock-out-time">
                          {format(parseISO(selectedAssignment.clockOutTime), "h:mm a")}
                        </span>
                      </div>
                    )}
                    {selectedAssignment.clockInTime && selectedAssignment.clockOutTime && (
                      <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
                        <span className="text-muted-foreground">Total Time:</span>
                        <span className="font-medium" data-testid="text-total-time">
                          {(() => {
                            const inTime = parseISO(selectedAssignment.clockInTime);
                            const outTime = parseISO(selectedAssignment.clockOutTime);
                            const diffMs = outTime.getTime() - inTime.getTime();
                            const hours = Math.floor(diffMs / (1000 * 60 * 60));
                            const mins = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            return `${hours}h ${mins}m`;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setSelectedAssignment(null)}
              data-testid="button-close-dialog"
            >
              Close
            </Button>
            
            {selectedAssignment?.status === 'assigned' && (
              <Button 
                onClick={() => acknowledgeAssignment.mutate(selectedAssignment.id)}
                disabled={acknowledgeAssignment.isPending}
                data-testid="button-confirm-shift"
              >
                {acknowledgeAssignment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm Shift
                  </>
                )}
              </Button>
            )}

            {selectedAssignment?.status === 'confirmed' && (
              <Button 
                onClick={() => handleClockIn(selectedAssignment.id)}
                disabled={clockInMutation.isPending || geofenceState.isLoading}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-clock-in"
              >
                {(clockInMutation.isPending || geofenceState.isLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {geofenceState.isLoading ? "Getting location..." : "Starting..."}
                  </>
                ) : (
                  <>
                    <Navigation className="mr-2 h-4 w-4" />
                    Clock In
                  </>
                )}
              </Button>
            )}

            {selectedAssignment?.status === 'in_progress' && (
              <Button 
                onClick={() => handleClockOut(selectedAssignment.id)}
                disabled={clockOutMutation.isPending || geofenceState.isLoading}
                variant="destructive"
                data-testid="button-clock-out"
              >
                {(clockOutMutation.isPending || geofenceState.isLoading) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {geofenceState.isLoading ? "Getting location..." : "Ending..."}
                  </>
                ) : (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    Clock Out
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Geofence Override Dialog */}
      <Dialog open={showGeofenceOverride} onOpenChange={(open) => {
        if (!open) {
          resetGeofenceState();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Location Outside Work Zone
            </DialogTitle>
            <DialogDescription>
              You are trying to clock {pendingClockAction === 'in' ? 'in' : 'out'} from a location outside the designated work area.
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="destructive" className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">Geofence Violation</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              {geofenceState.distance ? (
                <>You are approximately <strong>{Math.round(geofenceState.distance)}m</strong> away from the work location.</>
              ) : (
                <>Your current location is outside the allowed work zone.</>
              )}
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <Label htmlFor="override-reason">Override Reason (required)</Label>
            <Textarea
              id="override-reason"
              placeholder="Explain why you need to clock in/out from this location..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-override-reason"
            />
            <p className="text-xs text-muted-foreground">
              This action will be logged for review by your supervisor.
            </p>
          </div>
          
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => resetGeofenceState()}
              data-testid="button-cancel-override"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGeofenceOverride}
              disabled={!overrideReason.trim() || clockInMutation.isPending || clockOutMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-override"
            >
              {(clockInMutation.isPending || clockOutMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Override & Clock {pendingClockAction === 'in' ? 'In' : 'Out'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
