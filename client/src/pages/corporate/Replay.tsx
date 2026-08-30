import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Play, Pause, Clock, CheckCircle, XCircle, AlertTriangle, 
  RefreshCw, Calendar, Filter, ChevronRight, History, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";

interface ReplayJob {
  id: string;
  createdBy: string;
  createdAt: string;
  fromTimestamp: string;
  toTimestamp: string;
  filters: Record<string, string>;
  dryRun: boolean;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  totalEvents: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  errorSummary: string | null;
  progressPercent: number;
}

interface ReplayJobsResponse {
  jobs: ReplayJob[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

interface PreviewResponse {
  totalEvents: number;
  timeRange: {
    from: string;
    to: string;
  };
  filters: Record<string, string | null>;
  eventsByType: Array<{
    eventType: string;
    count: number;
  }>;
}

import { getStatusBadgeClass } from "@/lib/statusColors";
function getStatusBadge(status: string) {
  const icons: Record<string, React.ReactNode> = {
    pending:   <Clock className="w-3 h-3 mr-1" />,
    running:   <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
    completed: <CheckCircle className="w-3 h-3 mr-1" />,
    failed:    <XCircle className="w-3 h-3 mr-1" />,
    cancelled: <Pause className="w-3 h-3 mr-1" />,
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge className={getStatusBadgeClass(status)} data-testid={`badge-status-${status}`}>
      {icons[status]}{label}
    </Badge>
  );
}

function formatDateRange(from: string, to: string) {
  return `${format(new Date(from), 'MMM d, yyyy h:mm a')} - ${format(new Date(to), 'MMM d, yyyy h:mm a')}`;
}

export default function Replay() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [fromTimestamp, setFromTimestamp] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm"));
  const [toTimestamp, setToTimestamp] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [moveIdFilter, setMoveIdFilter] = useState('');
  const [driverIdFilter, setDriverIdFilter] = useState('');
  const [dryRun, setDryRun] = useState(true);

  const { data, isLoading, refetch, isFetching, error } = useQuery<ReplayJobsResponse>({
    queryKey: ['/api/admin/integrations/replay'],
    refetchInterval: 5000,
  });

  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ['/api/admin/integrations/replay/preview', { 
      from_timestamp: fromTimestamp, 
      to_timestamp: toTimestamp,
      event_type: eventTypeFilter || undefined,
      move_id: moveIdFilter || undefined,
      driver_id: driverIdFilter || undefined,
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        from_timestamp: new Date(fromTimestamp).toISOString(),
        to_timestamp: new Date(toTimestamp).toISOString(),
      });
      if (eventTypeFilter) params.append('event_type', eventTypeFilter);
      if (moveIdFilter) params.append('move_id', moveIdFilter);
      if (driverIdFilter) params.append('driver_id', driverIdFilter);
      
      const response = await fetch(`/api/admin/integrations/replay/preview?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to preview');
      return response.json();
    },
    enabled: isCreateDialogOpen && !!fromTimestamp && !!toTimestamp,
  });

  const createReplayMutation = useMutation({
    mutationFn: async (data: { 
      from_timestamp: string; 
      to_timestamp: string; 
      event_type?: string;
      move_id?: string;
      driver_id?: string;
      dry_run: boolean;
    }) => {
      return apiRequest('POST', '/api/admin/integrations/replay', data);
    },
    onSuccess: () => {
      toast({ title: "Replay job created", description: "The replay job has been started." });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/integrations/replay'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create replay job", description: error.message, variant: "destructive" });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/admin/integrations/replay/${jobId}/cancel`);
    },
    onSuccess: () => {
      toast({ title: "Replay job cancelled" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/integrations/replay'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel job", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateReplay = () => {
    createReplayMutation.mutate({
      from_timestamp: new Date(fromTimestamp).toISOString(),
      to_timestamp: new Date(toTimestamp).toISOString(),
      event_type: eventTypeFilter || undefined,
      move_id: moveIdFilter || undefined,
      driver_id: driverIdFilter || undefined,
      dry_run: dryRun,
    });
  };

  const activeJobs = data?.jobs.filter(j => j.status === 'running' || j.status === 'pending') || [];
  const completedJobs = data?.jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Replay & Backfill</h1>
          <p className="text-muted-foreground">Reprocess ingested events to rebuild derived state after bugs, schema upgrades, or outages</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-replay"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-replay">
                <Play className="h-4 w-4 mr-2" />
                New Replay Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Replay Job</DialogTitle>
                <DialogDescription>
                  Reprocess events within a time range to rebuild derived tables. Processors are idempotent—no duplicates will be created.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="from">From Timestamp</Label>
                    <Input
                      id="from"
                      type="datetime-local"
                      value={fromTimestamp}
                      onChange={(e) => setFromTimestamp(e.target.value)}
                      data-testid="input-from-timestamp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="to">To Timestamp</Label>
                    <Input
                      id="to"
                      type="datetime-local"
                      value={toTimestamp}
                      onChange={(e) => setToTimestamp(e.target.value)}
                      data-testid="input-to-timestamp"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Filter className="h-4 w-4" />Optional Filters</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="event_type" className="text-xs text-muted-foreground">Event Type</Label>
                      <Input
                        id="event_type"
                        placeholder="e.g., move.completed"
                        value={eventTypeFilter}
                        onChange={(e) => setEventTypeFilter(e.target.value)}
                        data-testid="input-event-type-filter"
                      />
                    </div>
                    <div>
                      <Label htmlFor="move_id" className="text-xs text-muted-foreground">Move ID</Label>
                      <Input
                        id="move_id"
                        placeholder="Specific move"
                        value={moveIdFilter}
                        onChange={(e) => setMoveIdFilter(e.target.value)}
                        data-testid="input-move-id-filter"
                      />
                    </div>
                    <div>
                      <Label htmlFor="driver_id" className="text-xs text-muted-foreground">Driver ID</Label>
                      <Input
                        id="driver_id"
                        placeholder="Specific driver"
                        value={driverIdFilter}
                        onChange={(e) => setDriverIdFilter(e.target.value)}
                        data-testid="input-driver-id-filter"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="dry-run" 
                    checked={dryRun} 
                    onCheckedChange={(checked) => setDryRun(checked as boolean)}
                    data-testid="checkbox-dry-run"
                  />
                  <Label htmlFor="dry-run" className="text-sm cursor-pointer">
                    Dry Run Mode (analyze without making changes)
                  </Label>
                </div>

                {previewQuery.data && (
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Preview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Events:</span>
                        <span className="font-medium" data-testid="text-preview-total">{previewQuery.data.totalEvents}</span>
                      </div>
                      {previewQuery.data.eventsByType.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">By Type:</span>
                          <div className="flex flex-wrap gap-1">
                            {previewQuery.data.eventsByType.slice(0, 5).map((et) => (
                              <Badge key={et.eventType} variant="secondary" className="text-xs">
                                {et.eventType}: {et.count}
                              </Badge>
                            ))}
                            {previewQuery.data.eventsByType.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{previewQuery.data.eventsByType.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {previewQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing events...
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateReplay}
                  disabled={createReplayMutation.isPending || !previewQuery.data}
                  data-testid="button-start-replay"
                >
                  {createReplayMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
                  ) : dryRun ? (
                    <><Play className="h-4 w-4 mr-2" />Start Dry Run</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Start Replay</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card data-testid="error-state">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Failed to Load Data</h3>
              <p className="text-muted-foreground mb-4">Unable to retrieve replay jobs.</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeJobs.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <CardTitle>Active Jobs</CardTitle>
                </div>
                <CardDescription>Currently running or pending replay jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4 space-y-3" data-testid={`card-job-${job.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(job.status)}
                          {job.dryRun && <Badge variant="outline">Dry Run</Badge>}
                          <span className="text-sm text-muted-foreground">
                            {formatDateRange(job.fromTimestamp, job.toTimestamp)}
                          </span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => cancelJobMutation.mutate(job.id)}
                          disabled={cancelJobMutation.isPending}
                          data-testid={`button-cancel-job-${job.id}`}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{job.progressPercent}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${job.progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Processed: {job.processedCount} | Skipped: {job.skippedCount} | Failed: {job.failedCount}</span>
                          <span>Total: {job.totalEvents}</span>
                        </div>
                      </div>

                      {Object.keys(job.filters).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(job.filters).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Job History</CardTitle>
              </div>
              <CardDescription>Past replay jobs and their results</CardDescription>
            </CardHeader>
            <CardContent>
              {completedJobs.length === 0 && activeJobs.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No Replay Jobs</h3>
                  <p className="text-muted-foreground mb-4">Create a new replay job to reprocess events.</p>
                </div>
              ) : completedJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No completed jobs yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Time Range</TableHead>
                      <TableHead>Filters</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedJobs.map((job) => (
                      <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(job.status)}
                            {job.dryRun && <Badge variant="outline" className="text-xs">Dry</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(job.fromTimestamp), 'MMM d')} - {format(new Date(job.toTimestamp), 'MMM d')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap max-w-[200px]">
                            {Object.keys(job.filters).length === 0 ? (
                              <span className="text-xs text-muted-foreground">None</span>
                            ) : (
                              Object.entries(job.filters).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm space-y-0.5">
                            <div className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              <span>{job.processedCount} processed</span>
                            </div>
                            {job.skippedCount > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {job.skippedCount} skipped (already done)
                              </div>
                            )}
                            {job.failedCount > 0 && (
                              <div className="text-xs text-red-500 flex items-center gap-1">
                                <XCircle className="h-3 w-3" />
                                {job.failedCount} failed
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.startedAt && job.completedAt ? (
                            `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(job.createdAt), 'MMM d, h:mm a')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {activeJobs.length === 0 && completedJobs.length === 0 && (
            <Card className="bg-muted/50">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="p-3 bg-primary/10 rounded-full">
                  <History className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Safe Event Reprocessing</h3>
                  <p className="text-sm text-muted-foreground">
                    Replay jobs are idempotent—reprocessing events will not create duplicate records. 
                    Use this to rebuild derived state (current move status, proofs index, time entries) after bug fixes or schema changes.
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
