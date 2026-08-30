import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ChevronDown, ChevronUp, Clock, Filter, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const actionLabels: Record<string, string> = {
  shift_created: "Shift Created",
  shift_updated: "Shift Updated",
  shift_deleted: "Shift Deleted",
  shift_published: "Shift Published",
  shift_cancelled: "Shift Cancelled",
  assignment_created: "Assignment Created",
  assignment_updated: "Assignment Updated",
  assignment_removed: "Assignment Removed",
  schedule_approved: "Schedule Approved",
  schedule_rejected: "Schedule Rejected",
  swap_approved: "Swap Approved",
  swap_rejected: "Swap Rejected",
  timesheet_approved: "Timesheet Approved",
  timesheet_rejected: "Timesheet Rejected",
  time_off_approved: "Time Off Approved",
  time_off_rejected: "Time Off Rejected",
  override_applied: "Override Applied",
  permission_granted: "Permission Granted",
  permission_revoked: "Permission Revoked",
  template_created: "Template Created",
  template_updated: "Template Updated",
  template_deleted: "Template Deleted",
};

const actionTypes = [
  "shift_created", "shift_updated", "shift_deleted", "shift_published", "shift_cancelled",
  "assignment_created", "assignment_updated", "assignment_removed",
  "schedule_approved", "schedule_rejected",
  "swap_approved", "swap_rejected",
  "timesheet_approved", "timesheet_rejected",
  "time_off_approved", "time_off_rejected",
  "override_applied",
  "permission_granted", "permission_revoked",
  "template_created", "template_updated", "template_deleted",
];

const entityTypes = [
  "shift", "assignment", "template", "timesheet", "swap", "time_off", "permission",
];

const entityLabels: Record<string, string> = {
  shift: "Shift",
  assignment: "Assignment",
  template: "Template",
  timesheet: "Timesheet",
  swap: "Swap",
  time_off: "Time Off",
  permission: "Permission",
};

function getActionBadgeVariant(actionType: string): "default" | "secondary" | "destructive" | "outline" {
  if (actionType.includes("created")) return "default";
  if (actionType.includes("updated") || actionType.includes("published")) return "secondary";
  if (actionType.includes("deleted") || actionType.includes("rejected") || actionType.includes("removed") || actionType.includes("revoked") || actionType.includes("cancelled")) return "destructive";
  return "outline";
}

function getActionBadgeClass(actionType: string): string {
  if (actionType.includes("created")) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-transparent";
  if (actionType.includes("updated") || actionType.includes("published")) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-transparent";
  if (actionType.includes("approved") || actionType.includes("granted")) return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-transparent";
  if (actionType.includes("deleted") || actionType.includes("rejected") || actionType.includes("removed") || actionType.includes("revoked") || actionType.includes("cancelled")) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-transparent";
  return "";
}

interface AuditLogEntry {
  id: string;
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  locationId: string | null;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogRow {
  log: AuditLogEntry;
  actorName: string;
  actorEmail: string;
  locationName: string | null;
}

interface AuditLogResponse {
  logs: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

interface PermissionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface LocationItem {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

export default function SchedulingAuditLogTab() {
  const [actionType, setActionType] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actorUserId, setActorUserId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (actionType !== "all") params.set("actionType", actionType);
    if (entityType !== "all") params.set("entityType", entityType);
    if (actorUserId !== "all") params.set("actorUserId", actorUserId);
    if (locationId !== "all") params.set("locationId", locationId);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    return params.toString();
  };

  const logsQuery = useQuery<AuditLogResponse>({
    queryKey: ["/api/corporate/scheduling/audit-log", actionType, entityType, actorUserId, locationId, startDate, endDate, offset],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/scheduling/audit-log?${buildQueryParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const usersQuery = useQuery<{ users: PermissionUser[] }>({
    queryKey: ["/api/corporate/scheduling/permissions/users"],
  });

  const locationsQuery = useQuery<LocationItem[]>({
    queryKey: ["/api/corporate/scheduling/locations"],
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const users = usersQuery.data?.users ?? [];
  const locations = locationsQuery.data ?? [];

  const hasFilters = actionType !== "all" || entityType !== "all" || actorUserId !== "all" || locationId !== "all" || startDate || endDate;

  const clearFilters = () => {
    setActionType("all");
    setEntityType("all");
    setActorUserId("all");
    setLocationId("all");
    setStartDate("");
    setEndDate("");
    setOffset(0);
    setExpandedId(null);
  };

  const canGoPrev = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" data-testid="text-audit-title">Audit Log</h2>
        <p className="text-sm text-muted-foreground">Immutable record of all scheduling actions. Entries cannot be edited or deleted.</p>
      </div>

      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-row flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

            <Select value={actionType} onValueChange={(v) => { setActionType(v); setOffset(0); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-action">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((at) => (
                  <SelectItem key={at} value={at}>{actionLabels[at]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={entityType} onValueChange={(v) => { setEntityType(v); setOffset(0); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-entity">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entityTypes.map((et) => (
                  <SelectItem key={et} value={et}>{entityLabels[et]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actorUserId} onValueChange={(v) => { setActorUserId(v); setOffset(0); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-actor">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={locationId} onValueChange={(v) => { setLocationId(v); setOffset(0); }}>
              <SelectTrigger className="w-[170px]" data-testid="select-filter-location">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setOffset(0); }}
              className="w-[150px]"
              data-testid="input-filter-start-date"
            />

            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setOffset(0); }}
              className="w-[150px]"
              data-testid="input-filter-end-date"
            />

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logsQuery.isError ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm" data-testid="error-audit-log">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="text-muted-foreground">Unable to load audit log.</span>
              <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => logsQuery.refetch()}>Retry</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">No audit entries found</p>
              <p className="text-sm mt-1">Adjust your filters or check back later.</p>
            </div>
          ) : (
            <>
              <Table data-testid="table-audit-log">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="w-[80px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((row) => {
                    const isExpanded = expandedId === row.log.id;
                    return (
                      <>
                        <TableRow key={row.log.id} data-testid={`row-audit-${row.log.id}`}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(row.log.createdAt), "MMM d, yyyy h:mm a")}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="text-sm font-medium">{row.actorName}</span>
                              <p className="text-xs text-muted-foreground">{row.actorEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getActionBadgeClass(row.log.actionType)}>
                              {actionLabels[row.log.actionType] || row.log.actionType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{entityLabels[row.log.entityType] || row.log.entityType}</span>
                            <p className="text-xs text-muted-foreground font-mono">{row.log.entityId}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.locationName || <span className="text-muted-foreground">--</span>}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedId(isExpanded ? null : row.log.id)}
                              data-testid={`button-view-details-${row.log.id}`}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 mr-1" />
                              ) : (
                                <ChevronDown className="h-4 w-4 mr-1" />
                              )}
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`detail-${row.log.id}`}>
                            <TableCell colSpan={6} className="p-0">
                              <Card className="m-3 border-dashed" data-testid={`card-audit-detail-${row.log.id}`}>
                                <CardContent className="p-4 space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {row.log.previousData && (
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Previous Data</p>
                                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[200px]">
                                          {JSON.stringify(row.log.previousData, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                    {row.log.newData && (
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">New Data</p>
                                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[200px]">
                                          {JSON.stringify(row.log.newData, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                  {row.log.metadata && Object.keys(row.log.metadata).length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Metadata</p>
                                      <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[150px]">
                                        {JSON.stringify(row.log.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                    {row.log.ipAddress && (
                                      <span>IP: {row.log.ipAddress}</span>
                                    )}
                                    {row.log.userAgent && (
                                      <span className="truncate max-w-[400px]">UA: {row.log.userAgent}</span>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground" data-testid="text-total-count">
                  {total} {total === 1 ? "entry" : "entries"} total
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoPrev}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {offset + 1}--{Math.min(offset + PAGE_SIZE, total)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoNext}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
