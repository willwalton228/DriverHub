import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  AlertTriangle, RefreshCw, RotateCcw, ChevronDown, ChevronRight,
  Loader2, XCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IngestedEvent } from "@shared/schema";

export default function DLQ() {
  const { toast } = useToast();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const { data: dlqData, isLoading, refetch } = useQuery<{ events: IngestedEvent[] }>({
    queryKey: ["/api/processing/dlq"],
  });

  const requeueMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/processing/dlq/${eventId}/requeue`);
      return res.json();
    },
    onSuccess: (_, eventId) => {
      toast({
        title: "Event requeued",
        description: `Event ${eventId.slice(0, 8)}... has been requeued for processing`,
      });
      queryClient.invalidateQueries({ predicate: (q) => 
        (q.queryKey[0] as string)?.startsWith("/api/processing")
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to requeue event", variant: "destructive" });
    },
  });

  const requeueAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/processing/dlq/requeue-all");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "All events requeued",
        description: "All DLQ events have been requeued for processing",
      });
      queryClient.invalidateQueries({ predicate: (q) => 
        (q.queryKey[0] as string)?.startsWith("/api/processing")
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to requeue all events", variant: "destructive" });
    },
  });

  const events = dlqData?.events || [];

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

  return (
    <div className="space-y-6 p-6" data-testid="page-dlq">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-dlq">
            <XCircle className="h-6 w-6 text-red-600" />
            Dead Letter Queue
          </h1>
          <p className="text-muted-foreground">Failed events that exceeded retry limits</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="destructive"
            onClick={() => requeueAllMutation.mutate()}
            disabled={requeueAllMutation.isPending || events.length === 0}
            data-testid="button-requeue-all"
          >
            {requeueAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Requeue All ({events.length})
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <CardTitle>DLQ Events</CardTitle>
              <CardDescription>
                These events failed after multiple retry attempts. Review the error and fix the underlying issue before requeuing.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" data-testid="loading-dlq">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-40 ml-auto" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-dlq">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No DLQ Events</h3>
              <p className="text-muted-foreground">Great! All events are processing successfully.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Last Error</TableHead>
                  <TableHead>Received At</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <>
                    <TableRow 
                      key={event.eventId}
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleExpand(event.eventId)}
                      data-testid={`row-dlq-${event.eventId}`}
                    >
                      <TableCell>
                        {expandedEvents.has(event.eventId) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.eventId.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.eventType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{event.retryCount || 0}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {event.lastError || "No error recorded"}
                      </TableCell>
                      <TableCell>{format(new Date(event.receivedAt), "MMM d, h:mm a")}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            requeueMutation.mutate(event.eventId);
                          }}
                          disabled={requeueMutation.isPending}
                          data-testid={`button-requeue-${event.eventId}`}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Requeue
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedEvents.has(event.eventId) && (
                      <TableRow key={`${event.eventId}-details`}>
                        <TableCell colSpan={7} className="bg-muted/50">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <p className="text-sm font-medium">Full Event ID</p>
                                <p className="text-sm text-muted-foreground font-mono">{event.eventId}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Move ID</p>
                                <p className="text-sm text-muted-foreground">{event.moveId || "N/A"}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Driver ID</p>
                                <p className="text-sm text-muted-foreground">{event.driverId || "N/A"}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-destructive">Error Details</p>
                              <div className="bg-destructive/10 p-3 rounded mt-1">
                                <p className="text-sm">{event.lastError || "No error message recorded"}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Event Payload</p>
                              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-48 mt-1">
                                {JSON.stringify(event.payloadJson, null, 2)}
                              </pre>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requeueMutation.mutate(event.eventId);
                                }}
                                disabled={requeueMutation.isPending}
                                data-testid={`button-requeue-expanded-${event.eventId}`}
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Requeue Event
                              </Button>
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
