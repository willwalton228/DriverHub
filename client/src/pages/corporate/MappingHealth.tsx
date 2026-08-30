import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle, Users, Route, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MappingHealthData {
  period: {
    since: string;
    until: string;
  };
  stats: {
    totalIngested: number;
    mappedOk: number;
    failedDriver: number;
    failedMove: number;
    pending: number;
  };
  healthPercentage: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  quarantinedEvents: Array<{
    eventId: string;
    eventType: string;
    mappingStatus: string;
    mappingError: string | null;
    driverId: string | null;
    moveId: string | null;
    receivedAt: string;
  }>;
}

function getHealthColor(status: string) {
  switch (status) {
    case 'healthy': return 'bg-green-500';
    case 'warning': return 'bg-yellow-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

function getHealthBadge(status: string) {
  switch (status) {
    case 'healthy': return <Badge data-testid="badge-health-status" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Healthy</Badge>;
    case 'warning': return <Badge data-testid="badge-health-status" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Warning</Badge>;
    case 'critical': return <Badge data-testid="badge-health-status" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Critical</Badge>;
    default: return <Badge data-testid="badge-health-status" variant="secondary">Unknown</Badge>;
  }
}

export default function MappingHealth() {
  const { data, isLoading, refetch, isFetching, error } = useQuery<MappingHealthData>({
    queryKey: ['/api/admin/mapping-health'],
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Execution Layer Mapping Health</h1>
          <p className="text-muted-foreground">Reference data mapping validation for DriverConnect events</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-mapping"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
              <p className="text-muted-foreground mb-4">Unable to retrieve mapping health statistics.</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Ingested</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-ingested">{data.stats.totalIngested}</div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mapped OK</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-mapped-ok">{data.stats.mappedOk}</div>
                <p className="text-xs text-muted-foreground">{data.healthPercentage}% success rate</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed Driver</CardTitle>
                <Users className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600" data-testid="text-failed-driver">{data.stats.failedDriver}</div>
                <p className="text-xs text-muted-foreground">Unknown driver_id</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed Move</CardTitle>
                <Route className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600" data-testid="text-failed-move">{data.stats.failedMove}</div>
                <p className="text-xs text-muted-foreground">Unknown move_id</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mapping Health Status</CardTitle>
                  <CardDescription>Overall health based on successful entity resolution</CardDescription>
                </div>
                {getHealthBadge(data.healthStatus)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Health Score</span>
                  <span className="font-medium" data-testid="text-health-percentage">{data.healthPercentage}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getHealthColor(data.healthStatus)} transition-all duration-500`}
                    style={{ width: `${data.healthPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>Period: {new Date(data.period.since).toLocaleDateString()} - {new Date(data.period.until).toLocaleDateString()}</span>
                  <span>{data.stats.mappedOk} / {data.stats.totalIngested} events mapped successfully</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {data.quarantinedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Quarantined Events</CardTitle>
                </div>
                <CardDescription>Events that failed mapping validation and require review</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Driver ID</TableHead>
                      <TableHead>Move ID</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.quarantinedEvents.map((event) => (
                      <TableRow key={event.eventId} data-testid={`row-quarantined-${event.eventId}`}>
                        <TableCell className="font-mono text-xs">{event.eventId.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.eventType}</Badge>
                        </TableCell>
                        <TableCell>
                          {event.mappingStatus === 'failed_driver' ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              <XCircle className="h-3 w-3 mr-1" />
                              Driver
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                              <XCircle className="h-3 w-3 mr-1" />
                              Move
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{event.driverId || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{event.moveId || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={event.mappingError || ''}>
                          {event.mappingError || '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(event.receivedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.quarantinedEvents.length === 0 && data.stats.totalIngested > 0 && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No Quarantined Events</h3>
                  <p className="text-muted-foreground">All ingested events have been successfully mapped to known entities.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No Data Available</h3>
              <p className="text-muted-foreground">No events have been ingested yet.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
