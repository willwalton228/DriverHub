import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, MapPin, Activity } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

interface ConflictRow {
  wiwLocationId: string;
  wiwLocationName: string;
  wlAccountId: string | null;
  wlAccountName: string | null;
  lamAccountId: string | null;
  lamAccountName: string | null;
  activeShiftCount: number;
  lastShiftDate: string | null;
  conflictType: "account_mismatch" | "null_account_id" | "orphan_shifts";
  recommendation: string;
}

interface MappingHealthData {
  summary: {
    totalLocations: number;
    locationsWithConflicts: number;
    locationsWithNullAccount: number;
    locationsWithMismatch: number;
    orphanShiftCount: number;
    overallStatus: "healthy" | "warning" | "critical";
  };
  conflicts: ConflictRow[];
  checkedAt: string;
}

function StatusBadge({ type }: { type: ConflictRow["conflictType"] }) {
  if (type === "account_mismatch") {
    return <Badge variant="destructive" data-testid="badge-conflict-mismatch">Account Mismatch</Badge>;
  }
  if (type === "null_account_id") {
    return <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400" data-testid="badge-conflict-null">Null Account</Badge>;
  }
  return <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400" data-testid="badge-conflict-orphan">Orphan Shifts</Badge>;
}

function OverallStatusIcon({ status }: { status: MappingHealthData["summary"]["overallStatus"] }) {
  if (status === "healthy") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  return <ShieldAlert className="h-5 w-5 text-destructive" />;
}

export default function WiwMappingHealth() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<MappingHealthData>({
    queryKey: ["/api/admin/wiw-mapping-health"],
  });

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-wiw-mapping-health">
            WIW Location Mapping Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detects conflicts between <code className="text-xs bg-muted px-1 rounded">wiw_locations.account_id</code> (authoritative) and the legacy mapping table. Conflicts cause blank schedule reports.
          </p>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/wiw-mapping-health"] })}
          data-testid="button-refresh-health"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive text-sm" data-testid="text-health-error">Failed to load mapping health data.</p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Overall Status</CardTitle>
                <OverallStatusIcon status={data.summary.overallStatus} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold capitalize" data-testid="text-overall-status">{data.summary.overallStatus}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.summary.totalLocations} locations checked</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mismatches</CardTitle>
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-mismatch-count">{data.summary.locationsWithMismatch}</p>
                <p className="text-xs text-muted-foreground mt-1">wl.account_id ≠ lam</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Null Account</CardTitle>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-null-count">{data.summary.locationsWithNullAccount}</p>
                <p className="text-xs text-muted-foreground mt-1">Locations with no account_id</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Orphan Shifts (30d)</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-orphan-shift-count">{data.summary.orphanShiftCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Shifts at unmapped locations</p>
              </CardContent>
            </Card>
          </div>

          {/* Conflict Table */}
          <Card>
            <CardHeader>
              <CardTitle>Location Conflicts</CardTitle>
              <CardDescription>
                {data.conflicts.length === 0
                  ? "No conflicts detected — all locations are correctly mapped."
                  : `${data.conflicts.length} location${data.conflicts.length !== 1 ? "s" : ""} with mapping issues. Fix by updating wiw_locations.account_id via the WIW Sync or Governance Console.`}
                {lastRefreshed && (
                  <span className="ml-2 text-xs text-muted-foreground">Last checked: {lastRefreshed}</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.conflicts.length === 0 ? (
                <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground" data-testid="text-no-conflicts">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  All WIW locations have correct account assignments.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WIW Location</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>wl.account_id (Truth)</TableHead>
                      <TableHead>lam (Legacy)</TableHead>
                      <TableHead className="text-right">Active Shifts</TableHead>
                      <TableHead>Last Shift</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.conflicts.map((row) => (
                      <TableRow key={row.wiwLocationId} data-testid={`row-conflict-${row.wiwLocationId}`}>
                        <TableCell>
                          <div className="font-medium text-sm">{row.wiwLocationName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{row.wiwLocationId.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge type={row.conflictType} />
                        </TableCell>
                        <TableCell>
                          {row.wlAccountName ? (
                            <div>
                              <div className="text-sm">{row.wlAccountName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{(row.wlAccountId ?? "").slice(0, 8)}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">NULL</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.lamAccountName ? (
                            <div>
                              <div className="text-sm">{row.lamAccountName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{(row.lamAccountId ?? "").slice(0, 8)}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm" data-testid={`text-shift-count-${row.wiwLocationId}`}>
                          {row.activeShiftCount > 0 ? (
                            <span className="text-orange-600 dark:text-orange-400 font-semibold">{row.activeShiftCount}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.lastShiftDate ? new Date(row.lastShiftDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs">
                          {row.recommendation}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
