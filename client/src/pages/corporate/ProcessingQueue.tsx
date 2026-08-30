import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  PlayCircle, Clock, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, Loader2, ChevronDown, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IngestedEvent } from "@shared/schema";

interface ProcessingStats {
  received: number;
  processing: number;
  processed: number;
  failed: number;
  dlq: number;
  total: number;
}

export default function ProcessingQueue() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<{ stats: ProcessingStats }>({
    queryKey: ["/api/processing/stats"],
  });

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery<{ events: IngestedEvent[] }>({
    queryKey: ["/api/processing/queue", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/processing/queue?${params}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
  });

  const triggerProcessingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/processing/trigger");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Processing triggered",
        description: `${data.stats.processed} processed, ${data.stats.failed} failed, ${data.stats.movedToDlq} moved to DLQ`,
      });
      queryClient.invalidateQueries({ predicate: (q) => 
        (q.queryKey[0] as string)?.startsWith("/api/processing")
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to trigger processing", variant: "destructive" });
    },
  });

  const stats = statsData?.stats;
  const events = queueData?.events || [];

  const toggleExpand = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const icons: Record<string, React.ReactNode> = {
      received:   <Clock className="w-3 h-3 mr-1" />,
      processing: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
      processed:  <CheckCircle className="w-3 h-3 mr-1" />,
      failed:     <AlertTriangle className="w-3 h-3 mr-1" />,
      dlq:        <XCircle className="w-3 h-3 mr-1" />,
    };
    const label = status === 'dlq' ? 'DLQ' : status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <Badge className={getStatusBadgeClass(status)} data-testid={`badge-status-${status}`}>
        {icons[status]}{label}
      </Badge>
    );
  };

  const handleRefresh = () => {
    refetchStats();
    refetchQueue();
  };

  return (
    <div className="space-y-6 p-6" data-testid="page-processing-queue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-processing-queue">Processing Queue</h1>
          <p className="text-muted-foreground">Monitor and manage event processing pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={() => triggerProcessingMutation.mutate()}
            disabled={triggerProcessingMutation.isPending}
            data-testid="button-trigger-processing"
          >
            {triggerProcessingMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Process Now
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card data-testid="card-received-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-received-count">{stats?.received || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-processing-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-processing-count">{stats?.processing || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-processed-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-processed-count">{stats?.processed || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-failed-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-failed-count">{stats?.failed || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="card-dlq-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              DLQ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-dlq-count">{stats?.dlq || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Queue Events</CardTitle>
              <CardDescription>Events waiting to be processed or retried</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {queueLoading ? (
            <div className="space-y-3" data-testid="loading-queue">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-40 ml-auto" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-events">
              No events in the queue. Events appear here when they are received but not yet processed.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Received At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <>
                    <TableRow 
                      key={event.eventId}
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleExpand(event.eventId)}
                      data-testid={`row-event-${event.eventId}`}
                    >
                      <TableCell>
                        {expandedEvents.has(event.eventId) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.eventId.slice(0, 8)}...</TableCell>
                      <TableCell>{event.eventType}</TableCell>
                      <TableCell>{getStatusBadge(event.processingStatus)}</TableCell>
                      <TableCell>{event.retryCount || 0}</TableCell>
                      <TableCell>{format(new Date(event.receivedAt), "MMM d, h:mm:ss a")}</TableCell>
                    </TableRow>
                    {expandedEvents.has(event.eventId) && (
                      <TableRow key={`${event.eventId}-details`}>
                        <TableCell colSpan={6} className="bg-muted/50">
                          <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm font-medium">Move ID</p>
                                <p className="text-sm text-muted-foreground">{event.moveId || "N/A"}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Driver ID</p>
                                <p className="text-sm text-muted-foreground">{event.driverId || "N/A"}</p>
                              </div>
                            </div>
                            {event.lastError && (
                              <div>
                                <p className="text-sm font-medium text-destructive">Last Error</p>
                                <p className="text-sm text-muted-foreground bg-destructive/10 p-2 rounded">{event.lastError}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium">Payload</p>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                                {JSON.stringify(event.payloadJson, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
