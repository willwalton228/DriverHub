import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Key, 
  Plus, 
  RefreshCw,
  Trash2,
  XCircle,
  Eye,
  RotateCcw
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface HealthData {
  status: string;
  lastEventAt: string | null;
  lastHour: {
    eventsReceived: number;
    failedEvents: number;
  };
  last24Hours: {
    total: number;
    received: number;
    processed: number;
    failed: number;
    unsupported: number;
    failureRate: number;
  };
}

interface IngestedEvent {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: string;
  receivedAt: string;
  sourceSystem: string;
  payloadJson: any;
  processingStatus: string;
  processedAt: string | null;
  lastError: string | null;
  retryCount: number;
  moveId: string | null;
  driverId: string | null;
}

interface EventsResponse {
  events: IngestedEvent[];
  summary: {
    byStatus: Record<string, number>;
    byEventType: Record<string, number>;
    recentFailures: number;
  };
  recentFailures: IngestedEvent[];
}

interface ApiKey {
  id: string;
  keyName: string;
  keyPrefix: string;
  sourceSystem: string;
  permissions: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
    healthy: { variant: "default", icon: CheckCircle2 },
    degraded: { variant: "secondary", icon: AlertTriangle },
    critical: { variant: "destructive", icon: XCircle },
  };
  
  const config = variants[status] || variants.degraded;
  const Icon = config.icon;
  
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ProcessingStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    received: "outline",
    processed: "default",
    failed: "destructive",
    unsupported: "secondary",
  };
  
  return (
    <Badge variant={variants[status] || "outline"}>
      {status}
    </Badge>
  );
}

export default function EventIngestion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<IngestedEvent | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeySource, setNewKeySource] = useState("execution_layer");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthData>({
    queryKey: ["/api/admin/integrations/health"],
  });

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useQuery<EventsResponse>({
    queryKey: ["/api/admin/integrations/events", statusFilter, eventTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (eventTypeFilter !== "all") params.append("eventType", eventTypeFilter);
      params.append("limit", "50");
      const res = await fetch(`/api/admin/integrations/events?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: apiKeys, isLoading: keysLoading, refetch: refetchKeys } = useQuery<ApiKey[]>({
    queryKey: ["/api/admin/integrations/api-keys"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: { keyName: string; sourceSystem: string }) => {
      const res = await apiRequest("POST", "/api/admin/integrations/api-keys", data);
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/api-keys"] });
      toast({
        title: "API Key Created",
        description: "Store this key securely - it cannot be retrieved again.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/api/admin/integrations/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/api-keys"] });
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked and can no longer be used.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (eventId: string) => {
      await apiRequest("POST", `/api/admin/integrations/events/${eventId}/reprocess`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/events"] });
      toast({
        title: "Event Queued",
        description: "The event has been queued for reprocessing.",
      });
      setSelectedEvent(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reprocess event",
        variant: "destructive",
      });
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Key name is required",
        variant: "destructive",
      });
      return;
    }
    createKeyMutation.mutate({ keyName: newKeyName, sourceSystem: newKeySource });
  };

  const handleCloseNewKeyDialog = () => {
    setShowNewKeyDialog(false);
    setNewKeyName("");
    setNewKeySource("execution_layer");
    setCreatedKey(null);
  };

  const eventTypes = eventsData?.summary?.byEventType 
    ? Object.keys(eventsData.summary.byEventType) 
    : [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">DriverConnect / MoveNow Monitoring</h1>
          <p className="text-muted-foreground">
            Monitor DriverConnect and MoveNow execution event ingestion
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => { refetchHealth(); refetchEvents(); }}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Integration Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="text-2xl font-bold">Loading...</div>
            ) : (
              <>
                <StatusBadge status={health?.status || "unknown"} />
                {health?.lastEventAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last event: {formatDistanceToNow(new Date(health.lastEventAt), { addSuffix: true })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Hour</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-hourly-events">
              {health?.lastHour?.eventsReceived || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              events received
              {(health?.lastHour?.failedEvents || 0) > 0 && (
                <span className="text-destructive ml-1">
                  ({health?.lastHour?.failedEvents} failed)
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 24 Hours</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-daily-events">
              {health?.last24Hours?.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              total events
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failure Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-failure-rate">
              {health?.last24Hours?.failureRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {health?.last24Hours?.failed || 0} failed events
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events" data-testid="tab-events">Events</TabsTrigger>
          <TabsTrigger value="failures" data-testid="tab-failures">Recent Failures</TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Ingested Events</CardTitle>
                  <CardDescription>View and manage execution events from DriverConnect</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="unsupported">Unsupported</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                      <SelectValue placeholder="All event types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All event types</SelectItem>
                      {eventTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading events...</div>
              ) : !eventsData?.events?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No events found. Events will appear here once DriverConnect starts sending them.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Occurred At</TableHead>
                      <TableHead>Received At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsData.events.map((event) => (
                      <TableRow key={event.eventId} data-testid={`row-event-${event.eventId}`}>
                        <TableCell className="font-mono text-xs">
                          {event.eventId.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.eventType}</Badge>
                        </TableCell>
                        <TableCell>
                          <ProcessingStatusBadge status={event.processingStatus} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(event.occurredAt), "MMM d, h:mm:ss a")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(event.receivedAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedEvent(event)}
                            data-testid={`button-view-event-${event.eventId}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
              <CardDescription>Events that failed processing</CardDescription>
            </CardHeader>
            <CardContent>
              {!eventsData?.recentFailures?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recent failures. Great!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Received At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsData.recentFailures.map((event) => (
                      <TableRow key={event.eventId}>
                        <TableCell className="font-mono text-xs">
                          {event.eventId.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.eventType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-destructive max-w-xs truncate">
                          {event.lastError || "Unknown error"}
                        </TableCell>
                        <TableCell>{event.retryCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(event.receivedAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reprocessMutation.mutate(event.eventId)}
                            disabled={reprocessMutation.isPending}
                            data-testid={`button-reprocess-${event.eventId}`}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Retry
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage service-to-service authentication keys</CardDescription>
                </div>
                <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-api-key">
                      <Plus className="h-4 w-4 mr-2" />
                      Create API Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create API Key</DialogTitle>
                      <DialogDescription>
                        Create a new API key for service-to-service authentication.
                      </DialogDescription>
                    </DialogHeader>
                    {createdKey ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-md">
                          <Label className="text-sm font-medium">Your API Key</Label>
                          <p className="font-mono text-sm mt-1 break-all select-all">
                            {createdKey}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                          <p className="text-sm text-destructive">
                            Store this key securely. It cannot be retrieved again.
                          </p>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCloseNewKeyDialog}>Done</Button>
                        </DialogFooter>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="keyName">Key Name</Label>
                            <Input
                              id="keyName"
                              placeholder="e.g., DriverConnect Production"
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                              data-testid="input-key-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sourceSystem">Source System</Label>
                            <Select value={newKeySource} onValueChange={setNewKeySource}>
                              <SelectTrigger data-testid="select-source-system">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="execution_layer">Execution Layer (DriverConnect)</SelectItem>
                                <SelectItem value="external_api">External API</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={handleCloseNewKeyDialog}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleCreateKey}
                            disabled={createKeyMutation.isPending}
                            data-testid="button-confirm-create-key"
                          >
                            Create Key
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {keysLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading API keys...</div>
              ) : !apiKeys?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p>No API keys configured.</p>
                  <p className="text-sm mt-1">Create an API key to allow DriverConnect to send events.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key Prefix</TableHead>
                      <TableHead>Source System</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                        <TableCell className="font-medium">{key.keyName}</TableCell>
                        <TableCell className="font-mono text-xs">{key.keyPrefix}...</TableCell>
                        <TableCell>
                          <Badge variant="outline">{key.sourceSystem}</Badge>
                        </TableCell>
                        <TableCell>
                          {key.isActive ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Revoked</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.lastUsedAt 
                            ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                            : "Never"
                          }
                        </TableCell>
                        <TableCell>{key.usageCount.toLocaleString()}</TableCell>
                        <TableCell>
                          {key.isActive && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to revoke this API key?")) {
                                  revokeKeyMutation.mutate(key.id);
                                }
                              }}
                              data-testid={`button-revoke-key-${key.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              Full details for event {selectedEvent?.eventId}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Event ID</Label>
                  <p className="font-mono text-sm">{selectedEvent.eventId}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Event Type</Label>
                  <p className="text-sm">{selectedEvent.eventType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Schema Version</Label>
                  <p className="text-sm">{selectedEvent.schemaVersion}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Processing Status</Label>
                  <ProcessingStatusBadge status={selectedEvent.processingStatus} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Occurred At</Label>
                  <p className="text-sm">{format(new Date(selectedEvent.occurredAt), "PPpp")}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Received At</Label>
                  <p className="text-sm">{format(new Date(selectedEvent.receivedAt), "PPpp")}</p>
                </div>
                {selectedEvent.moveId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Move ID</Label>
                    <p className="font-mono text-sm">{selectedEvent.moveId}</p>
                  </div>
                )}
                {selectedEvent.driverId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Driver ID</Label>
                    <p className="font-mono text-sm">{selectedEvent.driverId}</p>
                  </div>
                )}
              </div>
              
              {selectedEvent.lastError && (
                <div>
                  <Label className="text-xs text-muted-foreground">Error</Label>
                  <p className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-1">
                    {selectedEvent.lastError}
                  </p>
                </div>
              )}
              
              <div>
                <Label className="text-xs text-muted-foreground">Payload</Label>
                <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-auto max-h-[200px]">
                  {JSON.stringify(selectedEvent.payloadJson, null, 2)}
                </pre>
              </div>

              {selectedEvent.processingStatus === 'failed' && (
                <DialogFooter>
                  <Button
                    onClick={() => reprocessMutation.mutate(selectedEvent.eventId)}
                    disabled={reprocessMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reprocess Event
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
