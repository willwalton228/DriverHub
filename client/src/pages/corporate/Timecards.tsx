import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Clock, Play, Square, Coffee, ArrowRight, AlertTriangle,
  Loader2, Timer, History, FileEdit, CheckCircle2, XCircle,
  RefreshCw, TrendingUp,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";

interface ClockStatus {
  isClockedIn: boolean;
  isOnBreak: boolean;
  currentState: string;
  latestEvent: any;
  allowedActions: string[];
}

interface ShiftSummary {
  shiftId: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  totalShiftMinutes: number | null;
  overtimeFlag: boolean;
  longShiftFlag: boolean;
  userId: string;
  events: any[];
}

function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function PunchStatusLabel({ state }: { state: string }) {
  const labels: Record<string, { text: string; className: string }> = {
    none: { text: "Not Clocked In", className: "bg-muted text-muted-foreground" },
    clock_in: { text: "Clocked In", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    break_start: { text: "On Break", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    break_end: { text: "Clocked In", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    clock_out: { text: "Not Clocked In", className: "bg-muted text-muted-foreground" },
  };
  const info = labels[state] || labels.none;
  return <Badge className={info.className} data-testid="badge-punch-status">{info.text}</Badge>;
}

export default function Timecards() {
  const { toast } = useToast();
  const [punchNotes, setPunchNotes] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editPunchId, setEditPunchId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");

  const { data: status, isLoading: statusLoading } = useQuery<ClockStatus>({
    queryKey: ["/api/scheduling/time-clock/status"],
    refetchInterval: 30000,
  });

  const { data: shifts = [], isLoading: shiftsLoading, refetch: refetchShifts } = useQuery<ShiftSummary[]>({
    queryKey: ["/api/scheduling/time-clock/shifts"],
  });

  const punchMutation = useMutation({
    mutationFn: async (eventType: string) => {
      return apiRequest("POST", "/api/scheduling/time-clock/punch", {
        eventType,
        notes: punchNotes || undefined,
      });
    },
    onSuccess: async (_: any, eventType: string) => {
      const labels: Record<string, string> = {
        clock_in: "Clocked In",
        clock_out: "Clocked Out",
        break_start: "Break Started",
        break_end: "Break Ended",
      };
      toast({ title: labels[eventType] || "Punch Recorded", description: "Your time punch has been recorded." });
      setPunchNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/time-clock/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/time-clock/shifts"] });
    },
    onError: (error: any) => {
      toast({ title: "Punch Failed", description: error.message || "Could not record punch", variant: "destructive" });
    },
  });

  const editRequestMutation = useMutation({
    mutationFn: async (data: { punchId: string; reason: string }) => {
      return apiRequest("POST", "/api/scheduling/time-clock/edit-request", data);
    },
    onSuccess: () => {
      toast({ title: "Edit Request Submitted", description: "Your edit request has been sent for manager review." });
      setShowEditDialog(false);
      setEditPunchId(null);
      setEditReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit edit request", variant: "destructive" });
    },
  });

  const currentState = status?.currentState || "none";
  const allowedActions = status?.allowedActions || ["clock_in"];
  const isClockedIn = status?.isClockedIn || false;
  const isOnBreak = status?.isOnBreak || false;

  const activeShifts = shifts.filter(s => !s.clockOut).length;
  const completedToday = shifts.filter(s => {
    if (!s.clockOut) return false;
    const d = new Date(s.clockIn);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const totalMinutesToday = completedToday.reduce((sum, s) => sum + (s.totalShiftMinutes || 0), 0);
  const overtimeShifts = shifts.filter(s => s.overtimeFlag).length;

  const clockInTime = isClockedIn && status?.latestEvent
    ? (() => {
        // Find the clock_in event for the active shift
        const activeShift = shifts.find(s => !s.clockOut);
        return activeShift ? new Date(activeShift.clockIn) : null;
      })()
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Clock className="h-6 w-6 text-primary" />
            Time Clock
          </h1>
          <p className="text-muted-foreground">
            Punch in/out, track breaks, and view shift history
          </p>
        </div>
        <Button onClick={() => refetchShifts()} variant="outline" size="sm" data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Punch Control Panel */}
      <Card data-testid="punch-control-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-lg">Punch Clock</CardTitle>
            <PunchStatusLabel state={currentState} />
            {isClockedIn && clockInTime && (
              <span className="text-sm text-muted-foreground" data-testid="text-elapsed-time">
                <Timer className="h-3.5 w-3.5 inline mr-1" />
                Started {formatDistanceToNow(clockInTime, { addSuffix: true })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3" data-testid="punch-buttons">
            {allowedActions.includes("clock_in") && (
              <Button
                onClick={() => punchMutation.mutate("clock_in")}
                disabled={punchMutation.isPending}
                className="gap-2"
                data-testid="button-clock-in"
              >
                {punchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Clock In
              </Button>
            )}
            {allowedActions.includes("clock_out") && (
              <Button
                onClick={() => punchMutation.mutate("clock_out")}
                disabled={punchMutation.isPending}
                variant="destructive"
                className="gap-2"
                data-testid="button-clock-out"
              >
                {punchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Clock Out
              </Button>
            )}
            {allowedActions.includes("break_start") && (
              <Button
                onClick={() => punchMutation.mutate("break_start")}
                disabled={punchMutation.isPending}
                variant="outline"
                className="gap-2"
                data-testid="button-break-start"
              >
                {punchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
                Start Break
              </Button>
            )}
            {allowedActions.includes("break_end") && (
              <Button
                onClick={() => punchMutation.mutate("break_end")}
                disabled={punchMutation.isPending}
                variant="outline"
                className="gap-2"
                data-testid="button-break-end"
              >
                {punchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                End Break
              </Button>
            )}
          </div>
          <Input
            placeholder="Notes (optional)"
            value={punchNotes}
            onChange={(e) => setPunchNotes(e.target.value)}
            className="max-w-md"
            data-testid="input-punch-notes"
          />
          {statusLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading status...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Shifts</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-active-shifts">{activeShifts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hours Today</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-hours-today">{formatMinutes(totalMinutesToday)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Shifts</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-completed-shifts">{completedToday.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overtime Shifts</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-overtime-shifts">
              {overtimeShifts > 0 && <TrendingUp className="h-4 w-4 inline mr-1 text-amber-600" />}
              {overtimeShifts}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Shift History */}
      <Card data-testid="shift-history-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Shift History</CardTitle>
            <Badge variant="secondary" className="text-xs">{shifts.length} shifts</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {shiftsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading shifts...
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-shifts">
              No shifts recorded yet. Use the punch clock above to start tracking time.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.shiftId} data-testid={`row-shift-${shift.shiftId}`}>
                    <TableCell className="font-medium">
                      {format(new Date(shift.clockIn), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {format(new Date(shift.clockIn), "h:mm a")}
                    </TableCell>
                    <TableCell>
                      {shift.clockOut ? (
                        format(new Date(shift.clockOut), "h:mm a")
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                          <Clock className="h-3 w-3 mr-1 animate-pulse" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatMinutes(shift.breakMinutes)}</TableCell>
                    <TableCell className="font-mono">
                      {formatMinutes(shift.totalShiftMinutes)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {shift.overtimeFlag && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-overtime">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            OT
                          </Badge>
                        )}
                        {shift.longShiftFlag && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200" data-testid="badge-long-shift">
                            12h+
                          </Badge>
                        )}
                        {!shift.overtimeFlag && !shift.longShiftFlag && shift.clockOut && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {shift.clockOut && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const clockInEvent = shift.events?.find((e: any) => e.eventType === "clock_in");
                            if (clockInEvent) {
                              setEditPunchId(clockInEvent.id);
                              setShowEditDialog(true);
                            }
                          }}
                          data-testid={`button-edit-request-${shift.shiftId}`}
                        >
                          <FileEdit className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Request Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Punch Edit</DialogTitle>
            <DialogDescription>
              Submit an edit request for this punch. A manager must approve the change before it takes effect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Reason for Edit</label>
              <Textarea
                placeholder="Explain why this punch needs to be corrected..."
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                data-testid="input-edit-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditReason(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editPunchId && editReason.trim()) {
                  editRequestMutation.mutate({ punchId: editPunchId, reason: editReason });
                }
              }}
              disabled={!editReason.trim() || editRequestMutation.isPending}
              data-testid="button-submit-edit-request"
            >
              {editRequestMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
