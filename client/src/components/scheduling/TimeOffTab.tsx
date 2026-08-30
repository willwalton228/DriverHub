import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, isWithinInterval, addDays } from "date-fns";
import { Calendar, Clock, Check, X, Plus, AlertTriangle, User, CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TimeOffRequest {
  id: string;
  workerType: 'driver' | 'employee';
  driverId: string | null;
  employeeId: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  driverName?: string;
  employeeName?: string;
}

interface Shift {
  id: string;
  startTime: string;
  endTime: string;
  driverId?: string;
  employeeId?: string;
  status: string;
}

const timeOffFormSchema = z.object({
  workerType: z.enum(['driver', 'employee']),
  workerId: z.string().min(1, 'Please select a worker'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().optional(),
});

type TimeOffFormValues = z.infer<typeof timeOffFormSchema>;

export function TimeOffTab() {
  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="pending" data-testid="timeoff-tab-pending">Pending</TabsTrigger>
        <TabsTrigger value="all" data-testid="timeoff-tab-all">All Requests</TabsTrigger>
        <TabsTrigger value="conflicts" data-testid="timeoff-tab-conflicts">Conflicts</TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-6">
        <PendingApprovalsPanel />
      </TabsContent>
      <TabsContent value="all" className="mt-6">
        <AllRequestsPanel />
      </TabsContent>
      <TabsContent value="conflicts" className="mt-6">
        <ConflictsPanel />
      </TabsContent>
    </Tabs>
  );
}

function PendingApprovalsPanel() {
  const { toast } = useToast();
  
  const { data: requests, isLoading, isError, refetch } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/scheduling/time-off'],
  });

  const pendingRequests = useMemo(() => {
    return (requests || []).filter(r => r.status === 'pending');
  }, [requests]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/scheduling/time-off/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/time-off'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/shifts'] });
      toast({ title: "Time-off approved" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to approve", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const denyMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/scheduling/time-off/${id}/deny`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/time-off'] });
      toast({ title: "Time-off denied" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to deny", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" data-testid="error-pending-timeoff">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load time-off requests.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Time-Off Requests
          </CardTitle>
          <CardDescription>
            Review and approve or deny time-off requests from workers
          </CardDescription>
        </div>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          {pendingRequests.length} pending
        </Badge>
      </CardHeader>
      <CardContent>
        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending time-off requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div 
                key={request.id} 
                className="flex items-center justify-between p-4 border rounded-lg"
                data-testid={`timeoff-pending-${request.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {request.driverName || request.employeeName || 
                       (request.workerType === 'driver' ? `Driver ${request.driverId?.slice(0, 8)}` : `Employee ${request.employeeId?.slice(0, 8)}`)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {request.workerType}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span>
                      {format(parseISO(request.startDate), "MMM d")} - {format(parseISO(request.endDate), "MMM d, yyyy")}
                    </span>
                  </div>
                  {request.reason && (
                    <p className="text-sm mt-2 text-muted-foreground italic">
                      "{request.reason}"
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Requested {format(parseISO(request.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={() => approveMutation.mutate(request.id)}
                    disabled={approveMutation.isPending || denyMutation.isPending}
                    data-testid={`approve-timeoff-${request.id}`}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => denyMutation.mutate(request.id)}
                    disabled={approveMutation.isPending || denyMutation.isPending}
                    data-testid={`deny-timeoff-${request.id}`}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllRequestsPanel() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const { data: requests, isLoading, isError, refetch } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/scheduling/time-off'],
  });

  const { data: drivers } = useQuery<any[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: employees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  const form = useForm<TimeOffFormValues>({
    resolver: zodResolver(timeOffFormSchema),
    defaultValues: {
      workerType: 'driver',
      workerId: '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      reason: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TimeOffFormValues) => {
      const payload: any = {
        workerType: data.workerType,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason || null,
        status: 'pending',
      };

      if (data.workerType === 'driver') {
        payload.driverId = data.workerId;
      } else {
        payload.employeeId = data.workerId;
      }

      return apiRequest('POST', '/api/scheduling/time-off', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduling/time-off'] });
      toast({ title: "Time-off request created" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create request", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const filteredRequests = useMemo(() => {
    let result = requests || [];
    if (filterStatus !== 'all') {
      result = result.filter(r => r.status === filterStatus);
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, filterStatus]);

  const onSubmit = (data: TimeOffFormValues) => {
    createMutation.mutate(data);
  };

  const getStatusVariant = (status: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case 'approved': return 'default';
      case 'denied': return 'destructive';
      case 'pending': return 'secondary';
      default: return 'outline';
    }
  };

  const workerType = form.watch('workerType');
  const workerOptions = workerType === 'driver' 
    ? (drivers || []).map(d => ({ id: d.id, name: `${d.firstName} ${d.lastName}` }))
    : (employees || []).map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" data-testid="error-all-timeoff">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load time-off requests.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            All Time-Off Requests
          </CardTitle>
          <CardDescription>
            View and manage all time-off requests
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]" data-testid="timeoff-filter-status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-timeoff-btn">
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Time-Off Request</DialogTitle>
                <DialogDescription>
                  Submit a new time-off request for a worker
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="workerType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker Type</FormLabel>
                        <Select 
                          value={field.value} 
                          onValueChange={(v) => {
                            field.onChange(v);
                            form.setValue('workerId', '');
                          }}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="timeoff-worker-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="driver">Driver</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="timeoff-worker-select">
                              <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {workerOptions.map((w) => (
                              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field}
                              data-testid="timeoff-start-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field}
                              data-testid="timeoff-end-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Vacation, medical appointment, etc."
                            {...field}
                            data-testid="timeoff-reason"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="submit-timeoff-btn">
                      {createMutation.isPending ? 'Creating...' : 'Create Request'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {filteredRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No time-off requests found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request) => (
              <div 
                key={request.id} 
                className="flex items-center justify-between p-4 border rounded-lg"
                data-testid={`timeoff-request-${request.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {request.driverName || request.employeeName || 
                       (request.workerType === 'driver' ? `Driver ${request.driverId?.slice(0, 8)}` : `Employee ${request.employeeId?.slice(0, 8)}`)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {request.workerType}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span>
                      {format(parseISO(request.startDate), "MMM d")} - {format(parseISO(request.endDate), "MMM d, yyyy")}
                    </span>
                  </div>
                  {request.reason && (
                    <p className="text-sm mt-1 text-muted-foreground">
                      {request.reason}
                    </p>
                  )}
                </div>
                <Badge variant={getStatusVariant(request.status)}>
                  {request.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConflictsPanel() {
  const { data: timeOffData, isLoading: timeOffLoading, isError: timeOffError, refetch: refetchTimeOff } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/scheduling/time-off'],
  });

  const { data: shiftsData, isLoading: shiftsLoading, isError: shiftsError, refetch: refetchShifts } = useQuery<Shift[]>({
    queryKey: ['/api/scheduling/shifts'],
  });

  const conflicts = useMemo(() => {
    if (!timeOffData || !shiftsData) return [];
    
    const approvedTimeOff = timeOffData.filter(t => t.status === 'approved');
    const conflictList: Array<{
      timeOff: TimeOffRequest;
      shift: Shift;
    }> = [];

    for (const shift of shiftsData) {
      if (shift.status === 'cancelled') continue;
      
      const shiftDate = new Date(shift.startTime);
      
      for (const timeOff of approvedTimeOff) {
        const workerId = shift.driverId || shift.employeeId;
        const timeOffWorkerId = timeOff.driverId || timeOff.employeeId;
        
        if (workerId !== timeOffWorkerId) continue;
        
        const start = parseISO(timeOff.startDate);
        const end = parseISO(timeOff.endDate);
        
        if (isWithinInterval(shiftDate, { start, end })) {
          conflictList.push({ timeOff, shift });
        }
      }
    }

    return conflictList;
  }, [timeOffData, shiftsData]);

  if (timeOffLoading || shiftsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (timeOffError || shiftsError) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" data-testid="error-conflicts">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">
          Unable to load {timeOffError && shiftsError ? "time-off and shift data" : timeOffError ? "time-off data" : "shift data"}.
        </span>
        {timeOffError && <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetchTimeOff()}>Retry time-off</Button>}
        {shiftsError && <Button variant="ghost" size="sm" className="h-auto p-0 text-sm ml-1" onClick={() => refetchShifts()}>Retry shifts</Button>}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            PTO Conflicts
          </CardTitle>
          <CardDescription>
            Scheduled shifts that overlap with approved time-off
          </CardDescription>
        </div>
        {conflicts.length > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {conflicts.length} conflicts
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {conflicts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
            <p>No scheduling conflicts found</p>
            <p className="text-sm mt-1">All approved time-off is properly accounted for</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conflicts.map(({ timeOff, shift }, index) => (
              <Alert key={`${timeOff.id}-${shift.id}`} variant="destructive" data-testid={`conflict-${index}`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Scheduling Conflict</AlertTitle>
                <AlertDescription>
                  <div className="space-y-1 text-sm mt-2">
                    <p>
                      <span className="font-medium">Worker:</span>{' '}
                      {timeOff.driverName || timeOff.employeeName || 
                       `${timeOff.workerType} ${(timeOff.driverId || timeOff.employeeId)?.slice(0, 8)}`}
                    </p>
                    <p>
                      <span className="font-medium">Shift:</span>{' '}
                      {format(new Date(shift.startTime), "MMM d, yyyy h:mm a")} - {format(new Date(shift.endTime), "h:mm a")}
                    </p>
                    <p>
                      <span className="font-medium">Time Off:</span>{' '}
                      {format(parseISO(timeOff.startDate), "MMM d")} - {format(parseISO(timeOff.endDate), "MMM d, yyyy")}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
