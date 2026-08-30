import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  FileJson, Plus, AlertTriangle, CheckCircle, XCircle, 
  ChevronDown, ChevronRight, Clock, RefreshCw, Trash2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/statusColors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { EventSchema } from "@shared/schema";

interface SchemaFormData {
  eventType: string;
  schemaVersion: number;
  description: string;
  requiredFields: string;
  deprecationWindowDays: number;
  schemaJson: string;
}

const defaultSchemaJson = {
  type: "object",
  properties: {
    event_id: { type: "string" },
    event_type: { type: "string" },
    occurred_at: { type: "string", format: "date-time" },
    payload: { type: "object" }
  },
  required: ["event_id", "event_type", "occurred_at", "payload"]
};

export default function SchemaRegistry() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState<SchemaFormData>({
    eventType: "",
    schemaVersion: 1,
    description: "",
    requiredFields: "",
    deprecationWindowDays: 30,
    schemaJson: JSON.stringify(defaultSchemaJson, null, 2),
  });

  const { data: schemasData, isLoading, refetch } = useQuery<{ schemas: EventSchema[] }>({
    queryKey: ["/api/schemas", statusFilter, eventTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (eventTypeFilter && eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
      const res = await fetch(`/api/schemas?${params}`);
      if (!res.ok) throw new Error("Failed to fetch schemas");
      return res.json();
    },
  });

  const { data: eventTypesData } = useQuery<{ eventTypes: Record<string, { versions: { version: number; status: string }[] }> }>({
    queryKey: ["/api/schemas/event-types"],
  });

  const createSchemaMutation = useMutation({
    mutationFn: async (data: SchemaFormData) => {
      let schemaJson;
      try {
        schemaJson = JSON.parse(data.schemaJson);
      } catch {
        throw new Error("Invalid JSON in schema definition");
      }
      return apiRequest("POST", "/api/schemas", {
        eventType: data.eventType,
        schemaVersion: data.schemaVersion,
        description: data.description,
        requiredFields: data.requiredFields.split(",").map(f => f.trim()).filter(Boolean),
        deprecationWindowDays: data.deprecationWindowDays,
        schemaJson,
      });
    },
    onSuccess: () => {
      toast({ title: "Schema created successfully" });
      setIsAddDialogOpen(false);
      setFormData({
        eventType: "",
        schemaVersion: 1,
        description: "",
        requiredFields: "",
        deprecationWindowDays: 30,
        schemaJson: JSON.stringify(defaultSchemaJson, null, 2),
      });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0]?.toString().startsWith('/api/schemas')
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create schema", description: error.message, variant: "destructive" });
    },
  });

  const deprecateMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/schemas/${id}/deprecate`, {}),
    onSuccess: () => {
      toast({ title: "Schema deprecated successfully" });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0]?.toString().startsWith('/api/schemas')
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to deprecate schema", description: error.message, variant: "destructive" });
    },
  });

  const unsupportMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/schemas/${id}/unsupport`, {}),
    onSuccess: () => {
      toast({ title: "Schema marked as unsupported" });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0]?.toString().startsWith('/api/schemas')
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to mark schema as unsupported", description: error.message, variant: "destructive" });
    },
  });

  const schemas = schemasData?.schemas || [];
  const eventTypes = Object.keys(eventTypesData?.eventTypes || {});

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSchemas(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    const icons: Record<string, React.ReactNode> = {
      active:      <CheckCircle className="h-3 w-3 mr-1" />,
      deprecated:  <AlertTriangle className="h-3 w-3 mr-1" />,
      unsupported: <XCircle className="h-3 w-3 mr-1" />,
    };
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <Badge className={getStatusBadgeClass(status)} data-testid={`badge-status-${status}`}>
        {icons[status]}{label}
      </Badge>
    );
  };

  const activeCount = schemas.filter(s => s.status === "active").length;
  const deprecatedCount = schemas.filter(s => s.status === "deprecated").length;
  const unsupportedCount = schemas.filter(s => s.status === "unsupported").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="title-schema-registry">
            <FileJson className="h-6 w-6" />
            Event Schema Registry
          </h1>
          <p className="text-muted-foreground">Manage event schemas, versions, and compatibility policies</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-schema">
                <Plus className="h-4 w-4 mr-1" />
                Add Schema
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Register New Schema</DialogTitle>
                <DialogDescription>
                  Define a new event schema for validation during ingestion
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eventType">Event Type</Label>
                    <Input
                      id="eventType"
                      placeholder="e.g., MOVE_COMPLETED"
                      value={formData.eventType}
                      onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                      data-testid="input-event-type"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schemaVersion">Schema Version</Label>
                    <Input
                      id="schemaVersion"
                      type="number"
                      min={1}
                      value={formData.schemaVersion}
                      onChange={(e) => setFormData({ ...formData, schemaVersion: parseInt(e.target.value) || 1 })}
                      data-testid="input-schema-version"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Human-readable description of this schema version"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    data-testid="input-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="requiredFields">Required Fields (comma-separated)</Label>
                    <Input
                      id="requiredFields"
                      placeholder="e.g., driver_id, move_id, timestamp"
                      value={formData.requiredFields}
                      onChange={(e) => setFormData({ ...formData, requiredFields: e.target.value })}
                      data-testid="input-required-fields"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deprecationWindowDays">Deprecation Window (days)</Label>
                    <Input
                      id="deprecationWindowDays"
                      type="number"
                      min={1}
                      value={formData.deprecationWindowDays}
                      onChange={(e) => setFormData({ ...formData, deprecationWindowDays: parseInt(e.target.value) || 30 })}
                      data-testid="input-deprecation-window"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schemaJson">JSON Schema Definition</Label>
                  <Textarea
                    id="schemaJson"
                    className="font-mono text-sm min-h-[200px]"
                    value={formData.schemaJson}
                    onChange={(e) => setFormData({ ...formData, schemaJson: e.target.value })}
                    data-testid="textarea-schema-json"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button 
                  onClick={() => createSchemaMutation.mutate(formData)}
                  disabled={createSchemaMutation.isPending || !formData.eventType}
                  data-testid="button-submit-schema"
                >
                  {createSchemaMutation.isPending ? "Creating..." : "Create Schema"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-active-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Active Schemas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-9 w-16" data-testid="skeleton-active-count" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-active-count">{activeCount}</div>
            )}
            <p className="text-sm text-muted-foreground">Currently accepting events</p>
          </CardContent>
        </Card>
        <Card data-testid="card-deprecated-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Deprecated Schemas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-9 w-16" data-testid="skeleton-deprecated-count" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-deprecated-count">{deprecatedCount}</div>
            )}
            <p className="text-sm text-muted-foreground">In deprecation window</p>
          </CardContent>
        </Card>
        <Card data-testid="card-unsupported-count">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              Unsupported Schemas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-9 w-16" data-testid="skeleton-unsupported-count" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-unsupported-count">{unsupportedCount}</div>
            )}
            <p className="text-sm text-muted-foreground">Events quarantined</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schema Registry</CardTitle>
          <CardDescription>All registered event schemas and their versions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Status:</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                  <SelectItem value="unsupported">Unsupported</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Event Type:</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-event-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3" data-testid="loading-schemas">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-40 ml-auto" />
                </div>
              ))}
            </div>
          ) : schemas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-schemas">
              No schemas registered. Add your first schema to start validating events.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Required Fields</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schemas.map((schema) => (
                  <>
                    <TableRow key={schema.id} data-testid={`row-schema-${schema.id}`}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpanded(schema.id)}
                          data-testid={`button-expand-${schema.id}`}
                        >
                          {expandedSchemas.has(schema.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium" data-testid={`text-event-type-${schema.id}`}>
                        {schema.eventType}
                      </TableCell>
                      <TableCell data-testid={`text-version-${schema.id}`}>
                        v{schema.schemaVersion}
                      </TableCell>
                      <TableCell>{getStatusBadge(schema.status)}</TableCell>
                      <TableCell>
                        {schema.requiredFields?.length ? (
                          <span className="text-sm text-muted-foreground">
                            {schema.requiredFields.slice(0, 3).join(", ")}
                            {schema.requiredFields.length > 3 && ` +${schema.requiredFields.length - 3} more`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {schema.createdAt ? format(new Date(schema.createdAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {schema.status === "active" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deprecateMutation.mutate(schema.id)}
                              disabled={deprecateMutation.isPending}
                              data-testid={`button-deprecate-${schema.id}`}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              Deprecate
                            </Button>
                          )}
                          {schema.status === "deprecated" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => unsupportMutation.mutate(schema.id)}
                              disabled={unsupportMutation.isPending}
                              data-testid={`button-unsupport-${schema.id}`}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              End Support
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSchemas.has(schema.id) && (
                      <TableRow key={`${schema.id}-details`}>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="p-4 space-y-4">
                            {schema.description && (
                              <div>
                                <Label className="text-sm font-medium">Description</Label>
                                <p className="text-sm text-muted-foreground">{schema.description}</p>
                              </div>
                            )}
                            {schema.deprecatedAt && (
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-sm font-medium">Deprecated At</Label>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(schema.deprecatedAt), "MMM d, yyyy h:mm a")}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-sm font-medium">Deprecation Window</Label>
                                  <p className="text-sm text-muted-foreground">
                                    {schema.deprecationWindowDays} days
                                  </p>
                                </div>
                              </div>
                            )}
                            <div>
                              <Label className="text-sm font-medium">JSON Schema</Label>
                              <pre className="mt-1 p-3 bg-muted rounded text-xs font-mono overflow-x-auto max-h-[200px]">
                                {JSON.stringify(schema.schemaJson, null, 2)}
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
