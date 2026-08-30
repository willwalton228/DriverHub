import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldCheck, Trash2, Users, Info, MapPin, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface Permission {
  id: number;
  userId: number;
  permissionLevel: string;
  locationId: number | null;
  teamId: string | null;
  isActive: boolean;
  grantedBy: number | null;
  grantedAt: string;
  revokedAt: string | null;
  revokedBy: number | null;
  notes: string | null;
}

interface PermissionEntry {
  permission: Permission;
  userName: string;
  userEmail: string;
  userRole: string;
  locationName: string | null;
}

interface MyPermission {
  permissionLevel: "view" | "edit" | "approve" | "publish";
  role: string;
}

interface PermissionUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Location {
  id: number;
  name: string;
}

const LEVEL_BADGE_VARIANT: Record<string, string> = {
  view: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  edit: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  approve: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  publish: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

function PermissionLevelBadge({ level }: { level: string }) {
  return (
    <Badge variant="outline" className={LEVEL_BADGE_VARIANT[level] || ""}>
      {level}
    </Badge>
  );
}

export default function SchedulingPermissionsTab() {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissionLevel, setPermissionLevel] = useState("");
  const [locationId, setLocationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [notes, setNotes] = useState("");

  const myPermissionQuery = useQuery<MyPermission>({
    queryKey: ["/api/corporate/scheduling/permissions/my"],
  });

  const permissionsQuery = useQuery<{ permissions: PermissionEntry[] }>({
    queryKey: ["/api/corporate/scheduling/permissions"],
  });

  const usersQuery = useQuery<{ users: PermissionUser[] }>({
    queryKey: ["/api/corporate/scheduling/permissions/users"],
  });

  const locationsQuery = useQuery<{ locations: Location[] }>({
    queryKey: ["/api/corporate/scheduling/locations"],
  });

  const myPermError = myPermissionQuery.isError;
  const usersLoadError = usersQuery.isError;
  const locationsLoadError = locationsQuery.isError;

  const grantMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        userId: selectedUserId,
        permissionLevel,
      };
      if (locationId && locationId !== "all") body.locationId = locationId;
      if (teamId.trim()) body.teamId = teamId.trim();
      if (notes.trim()) body.notes = notes.trim();
      const res = await apiRequest("POST", "/api/corporate/scheduling/permissions", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/permissions"] });
      toast({ title: "Permission granted", description: "The scheduling permission has been assigned." });
      setSelectedUserId("");
      setPermissionLevel("");
      setLocationId("");
      setTeamId("");
      setNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to grant permission.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/corporate/scheduling/permissions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/permissions"] });
      toast({ title: "Permission revoked", description: "The scheduling permission has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to revoke permission.", variant: "destructive" });
    },
  });

  const myLevel = myPermissionQuery.data?.permissionLevel;
  const isAdmin = myPermissionQuery.data?.role === "admin" || myPermissionQuery.data?.role === "corporate";
  const users = usersQuery.data?.users || [];
  const locations = locationsQuery.data?.locations || [];
  const permissions = permissionsQuery.data?.permissions || [];

  const canSubmit = selectedUserId && permissionLevel && !grantMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-permissions-title">Permissions</h2>
          <p className="text-sm text-muted-foreground">Manage scheduling access levels for team members</p>
        </div>
        {myPermError ? (
          <div className="flex items-center gap-1.5 text-xs text-destructive" data-testid="error-my-permission">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Failed to load your level</span>
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => myPermissionQuery.refetch()}>Retry</Button>
          </div>
        ) : myLevel ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Your level:</span>
            <Badge data-testid="badge-my-permission" variant="outline" className={LEVEL_BADGE_VARIANT[myLevel] || ""}>
              <Shield className="h-3 w-3 mr-1" />
              {myLevel}
            </Badge>
          </div>
        ) : null}
      </div>

      {myPermError ? (
        <div className="flex items-center gap-2 py-2 text-sm" data-testid="error-grant-form-blocked">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to determine your access level — grant form unavailable.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => myPermissionQuery.refetch()}>Retry</Button>
        </div>
      ) : isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Grant Permission
            </CardTitle>
            <CardDescription>Assign scheduling access to a user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">User</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger data-testid="select-user">
                    <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.firstName} {u.lastName} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {usersLoadError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive mt-0.5" data-testid="error-users-load">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>Failed to load users</span>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => usersQuery.refetch()}>Retry</Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Permission Level</label>
                <Select value={permissionLevel} onValueChange={setPermissionLevel}>
                  <SelectTrigger data-testid="select-permission-level">
                    <Shield className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="publish">Publish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location Scope</label>
                <Select value={locationId || "all"} onValueChange={(v) => setLocationId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-location">
                    <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locationsLoadError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive mt-0.5" data-testid="error-locations-load">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    <span>Failed to load locations</span>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => locationsQuery.refetch()}>Retry</Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Team ID (optional)</label>
                <Input
                  placeholder="Enter team ID"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  data-testid="input-team-id"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this permission grant"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                data-testid="textarea-notes"
              />
            </div>

            <Button
              onClick={() => grantMutation.mutate()}
              disabled={!canSubmit}
              data-testid="button-grant-permission"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {grantMutation.isPending ? "Granting..." : "Grant Permission"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {permissionsQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : permissionsQuery.isError ? (
            <div className="flex items-center gap-2 py-4 text-sm" data-testid="error-permissions">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="text-muted-foreground">Unable to load permissions.</span>
              <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => permissionsQuery.refetch()}>Retry</Button>
            </div>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No permissions have been granted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-permissions">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Permission Level</TableHead>
                    <TableHead>Location Scope</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Granted By</TableHead>
                    <TableHead>Granted At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((entry) => (
                    <TableRow key={entry.permission.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{entry.userName}</span>
                          <p className="text-xs text-muted-foreground">{entry.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PermissionLevelBadge level={entry.permission.permissionLevel} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {entry.locationName || "All Locations"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {entry.permission.teamId || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {entry.permission.grantedBy || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {entry.permission.grantedAt
                            ? format(new Date(entry.permission.grantedAt), "MMM d, yyyy")
                            : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => revokeMutation.mutate(entry.permission.id)}
                            disabled={revokeMutation.isPending}
                            data-testid={`button-revoke-permission-${entry.permission.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-permission-hierarchy">
        <CardContent className="flex items-start gap-3 py-4 px-4">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Permission Hierarchy</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <PermissionLevelBadge level="view" />
                <span className="text-muted-foreground">See schedules</span>
              </div>
              <div className="flex items-center gap-2">
                <PermissionLevelBadge level="edit" />
                <span className="text-muted-foreground">Create/modify shifts</span>
              </div>
              <div className="flex items-center gap-2">
                <PermissionLevelBadge level="approve" />
                <span className="text-muted-foreground">Approve schedule changes</span>
              </div>
              <div className="flex items-center gap-2">
                <PermissionLevelBadge level="publish" />
                <span className="text-muted-foreground">Publish and finalize</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">view &lt; edit &lt; approve &lt; publish</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
