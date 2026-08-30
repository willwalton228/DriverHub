import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, XCircle, Filter, RefreshCw, Clock, User, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TimecardException {
  id: number;
  driverId: string;
  exceptionType: string;
  status: string;
  relatedTimeEntryId: number | null;
  description: string | null;
  resolutionNote: string | null;
  sourceEventId: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExceptionsResponse {
  exceptions: TimecardException[];
  total: number;
  limit: number;
  offset: number;
}

const exceptionTypeLabels: Record<string, string> = {
  missing_clock_out: "Missing Clock-Out",
  missing_clock_in: "Missing Clock-In",
  overlap: "Overlapping Shift",
  excessive_duration: "Excessive Duration",
  gap: "Time Gap",
  out_of_geo: "Out of Geofence",
  auto_closed: "Auto-Closed Shift",
};

function getExceptionTypeBadge(type: string) {
  const label = exceptionTypeLabels[type] || type;
  switch (type) {
    case "missing_clock_out":
    case "missing_clock_in":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{label}</Badge>;
    case "overlap":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{label}</Badge>;
    case "excessive_duration":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{label}</Badge>;
    case "auto_closed":
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

import { getStatusBadgeClass } from "@/lib/statusColors";
function getStatusBadge(status: string) {
  return <Badge className={getStatusBadgeClass(status)} data-testid={`badge-status-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export default function TimecardExceptions() {
  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedExceptionId, setSelectedExceptionId] = useState<number | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<"resolved" | "dismissed">("resolved");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery<ExceptionsResponse>({
    queryKey: ["/api/payroll/exceptions", driverFilter, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (driverFilter) params.set("driverId", driverFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter && typeFilter !== "all") params.set("exceptionType", typeFilter);
      const response = await fetch(`/api/payroll/exceptions?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch exceptions");
      return response.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: number; status: string; note: string }) => {
      return apiRequest("PATCH", `/api/payroll/exceptions/${id}`, {
        status,
        resolutionNote: note,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/exceptions"] });
      toast({ title: "Exception updated", description: "The exception has been resolved." });
      setDialogOpen(false);
      setResolutionNote("");
      setSelectedExceptionId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const exceptions = data?.exceptions || [];
  const total = data?.total || 0;

  const openCount = exceptions.filter(e => e.status === "open").length;
  const resolvedCount = exceptions.filter(e => e.status === "resolved").length;

  const handleResolve = (id: number, action: "resolved" | "dismissed") => {
    setSelectedExceptionId(id);
    setResolveAction(action);
    setDialogOpen(true);
  };

  const confirmResolve = () => {
    if (selectedExceptionId) {
      resolveMutation.mutate({
        id: selectedExceptionId,
        status: resolveAction,
        note: resolutionNote,
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Timecard Exceptions
          </h1>
          <p className="text-muted-foreground">
            Review and resolve timecard anomalies requiring attention
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Exceptions</CardDescription>
            <CardTitle className="text-2xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">{openCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Resolved</CardDescription>
            <CardTitle className="text-2xl text-green-600">{resolvedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Driver ID"
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="w-40"
                data-testid="input-driver-filter"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44" data-testid="select-type-filter">
                  <SelectValue placeholder="Exception Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="missing_clock_out">Missing Clock-Out</SelectItem>
                  <SelectItem value="missing_clock_in">Missing Clock-In</SelectItem>
                  <SelectItem value="overlap">Overlapping Shift</SelectItem>
                  <SelectItem value="excessive_duration">Excessive Duration</SelectItem>
                  <SelectItem value="auto_closed">Auto-Closed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDriverFilter("");
                  setStatusFilter("open");
                  setTypeFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading exceptions...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">Failed to load exceptions</div>
          ) : exceptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No exceptions found. Great job keeping timecards clean!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((exception) => (
                  <TableRow key={exception.id} data-testid={`row-exception-${exception.id}`}>
                    <TableCell>
                      <Link href={`/corporate/driver/${exception.driverId}`}>
                        <div className="flex items-center gap-2 text-primary hover:underline cursor-pointer">
                          <User className="h-4 w-4" />
                          <span className="font-mono text-sm">{exception.driverId.slice(0, 8)}...</span>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {getExceptionTypeBadge(exception.exceptionType)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-muted-foreground truncate" title={exception.description || ""}>
                        {exception.description || "-"}
                      </p>
                      {exception.relatedTimeEntryId && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          Entry #{exception.relatedTimeEntryId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(exception.status)}
                      {exception.resolutionNote && (
                        <p className="text-xs text-muted-foreground mt-1 truncate max-w-32" title={exception.resolutionNote}>
                          {exception.resolutionNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {format(parseISO(exception.createdAt), "MMM d, yyyy h:mm a")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {exception.status === "open" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleResolve(exception.id, "resolved")}
                            data-testid={`button-resolve-${exception.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-500 hover:text-gray-600"
                            onClick={() => handleResolve(exception.id, "dismissed")}
                            data-testid={`button-dismiss-${exception.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolveAction === "resolved" ? "Resolve Exception" : "Dismiss Exception"}
            </DialogTitle>
            <DialogDescription>
              {resolveAction === "resolved"
                ? "Mark this exception as resolved with an optional note."
                : "Dismiss this exception as not requiring action."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Resolution Note (optional)</label>
            <Textarea
              placeholder="Enter notes about how this was resolved..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              data-testid="input-resolution-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmResolve}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveMutation.isPending ? "Saving..." : resolveAction === "resolved" ? "Resolve" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-sm text-muted-foreground">
        Showing {exceptions.length} of {total} exceptions
      </div>
    </div>
  );
}
