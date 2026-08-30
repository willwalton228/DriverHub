import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Building2,
  Users,
  Shield,
  ShieldCheck,
  ToggleLeft,
  ScrollText,
  Search,
  ChevronRight,
  AlertTriangle,
  Clock,
  TrendingUp,
  UserMinus,
  UserPlus,
  Plus,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  Bell,
  BarChart3,
  Activity,
  CheckCircle,
  XCircle,
  RotateCcw,
  DatabaseZap,
  Flame,
  Calendar,
  Send,
  MailCheck,
  CalendarClock,
  Pencil,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface PlatformStats {
  totalOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  superAdminCount: number;
  recentActivity: AuditEntry[];
}

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  userCount: number;
}

interface PlatformUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  status: string | null;
  orgId: string | null;
  isProvisioned: boolean | null;
  corporateAccessAdmin: boolean | null;
  canGrantSensitiveDataAccess: boolean | null;
  canGrantExports: boolean | null;
  createdAt: string | null;
  heymarketMemberId: number | null;
}

interface FeatureToggle {
  id: string;
  key: string;
  label: string;
  description: string | null;
  scope: string;
  enabled: boolean;
  orgOverrides: Record<string, boolean>;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  category: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_user: "Super Admin",
  super_admin: "Super Admin",
  admin: "Admin",
  corporate_admin: "Corp Admin",
  corporate: "Corporate",
  ops_manager: "Ops Manager",
  finance: "Finance",
  recruiter: "Recruiter",
  regional_cl: "Regional CL",
  network_cl: "Network CL",
  dealer_cl: "Dealer CL",
  certification_liaison: "Certification",
  employee: "Employee",
  driver: "Driver",
};

const CATEGORY_COLORS: Record<string, string> = {
  role_management: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  tenant_management: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  feature_management: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  system_override: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

function isSA(role: string | null) {
  return role === "super_user" || role === "super_admin";
}

export default function PlatformAdminConsole() {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="platform-admin-denied">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <Shield className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              Platform Admin Console is restricted to Super Admin users only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="platform-admin-console">
      <div className="flex items-center gap-3 flex-wrap">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold" data-testid="text-platform-admin-title">Platform Admin Console</h1>
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          Super Admin
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-platform-admin">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="toggles" data-testid="tab-toggles">Feature Toggles</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="dataops" data-testid="tab-dataops">
            <DatabaseZap className="h-3.5 w-3.5 mr-1.5" />
            Data Ops
          </TabsTrigger>
          <TabsTrigger value="report-delivery" data-testid="tab-report-delivery">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Report Delivery
          </TabsTrigger>
          <TabsTrigger value="communications" data-testid="tab-communications">
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Communications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="organizations" className="mt-4">
          <OrganizationsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="toggles" className="mt-4">
          <FeatureTogglesTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="dataops" className="mt-4">
          <ClaimsDataPurgeTab />
        </TabsContent>
        <TabsContent value="report-delivery" className="mt-4">
          <ReportDeliveryTab />
        </TabsContent>
        <TabsContent value="communications" className="mt-4">
          <CommunicationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  if (isLoading) {
    return <div className="text-muted-foreground" data-testid="text-loading-stats">Loading platform stats...</div>;
  }

  return (
    <div className="space-y-6" data-testid="overview-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-stat-orgs">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalOrganizations ?? 0}</p>
                <p className="text-sm text-muted-foreground">Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-users">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalUsers ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-active">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.activeUsers ?? 0}</p>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-sa">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.superAdminCount ?? 0}</p>
                <p className="text-sm text-muted-foreground">Super Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-activity">
        <CardHeader>
          <CardTitle className="text-lg">Recent Super Admin Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm border-b last:border-b-0 pb-3 last:pb-0" data-testid={`audit-entry-${entry.id}`}>
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{entry.action.replace(/_/g, " ")}</p>
                    <p className="text-muted-foreground">{entry.actorEmail}</p>
                    {entry.targetLabel && <p className="text-muted-foreground">Target: {entry.targetLabel}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge className={CATEGORY_COLORS[entry.category] || ""}>
                    {entry.category.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm" data-testid="text-no-activity">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationsTab() {
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/platform/organizations", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/platform/organizations${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
  });

  const { data: orgDetail } = useQuery({
    queryKey: ["/api/platform/organizations", selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return null;
      const res = await fetch(`/api/platform/organizations/${selectedOrg}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization");
      return res.json();
    },
    enabled: !!selectedOrg,
  });

  return (
    <div className="space-y-4" data-testid="organizations-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-orgs"
          />
        </div>
        <Badge>{orgs.length} organizations</Badge>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" data-testid="text-loading-orgs">Loading organizations...</p>
      ) : (
        <div className="grid gap-3">
          {orgs.map((org) => (
            <Card
              key={org.id}
              className={`cursor-pointer hover-elevate ${selectedOrg === org.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedOrg(selectedOrg === org.id ? null : org.id)}
              data-testid={`card-org-${org.id}`}
            >
              <CardContent className="flex items-center justify-between gap-3 pt-4 pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{org.name}</p>
                    {org.slug && <p className="text-sm text-muted-foreground truncate">{org.slug}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge>{org.userCount} users</Badge>
                  <Badge className={org.isActive ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}>
                    {org.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedOrg === org.id ? "rotate-90" : ""}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedOrg && orgDetail && (
        <Card data-testid="card-org-detail">
          <CardHeader>
            <CardTitle>{orgDetail.name}</CardTitle>
            <CardDescription>Organization Details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-muted-foreground">ID</p>
                <p className="font-mono text-xs">{orgDetail.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Slug</p>
                <p>{orgDetail.slug || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p>{orgDetail.isActive ? "Active" : "Inactive"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{orgDetail.createdAt ? new Date(orgDetail.createdAt).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>

            {orgDetail.users && orgDetail.users.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Users ({orgDetail.users.length})</h4>
                <div className="border rounded-md divide-y max-h-60 overflow-auto">
                  {orgDetail.users.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm" data-testid={`org-user-${u.id}`}>
                      <div className="min-w-0">
                        <p className="truncate">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge>{ROLE_LABELS[u.role || ""] || u.role}</Badge>
                        <Badge className={u.status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}>
                          {u.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showGrantDialog, setShowGrantDialog] = useState<PlatformUser | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState<PlatformUser | null>(null);
  const [justification, setJustification] = useState("");
  const [showHeymarketDialog, setShowHeymarketDialog] = useState<PlatformUser | null>(null);
  const [heymarketIdInput, setHeymarketIdInput] = useState("");

  const { data: usersList = [], isLoading } = useQuery<PlatformUser[]>({
    queryKey: ["/api/platform/users", search, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter && roleFilter !== "all") params.set("role", roleFilter);
      const res = await fetch(`/api/platform/users?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const grantSAMutation = useMutation({
    mutationFn: async ({ userId, justification }: { userId: string; justification: string }) => {
      const res = await apiRequest("POST", `/api/platform/users/${userId}/grant-super-admin`, { justification });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Super Admin access granted" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/audit-log"] });
      setShowGrantDialog(null);
      setJustification("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to grant Super Admin", description: err.message, variant: "destructive" });
    },
  });

  const revokeSAMutation = useMutation({
    mutationFn: async ({ userId, justification }: { userId: string; justification: string }) => {
      const res = await apiRequest("POST", `/api/platform/users/${userId}/revoke-super-admin`, { justification });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Super Admin access revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/audit-log"] });
      setShowRevokeDialog(null);
      setJustification("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke Super Admin", description: err.message, variant: "destructive" });
    },
  });

  const setHeymarketMemberMutation = useMutation({
    mutationFn: async ({ userId, heymarketMemberId }: { userId: string; heymarketMemberId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/platform/users/${userId}/heymarket-member`, { heymarketMemberId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Heymarket member ID updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      setShowHeymarketDialog(null);
      setHeymarketIdInput("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to update Heymarket member ID", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4" data-testid="users-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-users"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40" data-testid="select-role-filter">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="super_user">Super Admin</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="corporate_admin">Corp Admin</SelectItem>
            <SelectItem value="ops_manager">Ops Manager</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="recruiter">Recruiter</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
          </SelectContent>
        </Select>
        <Badge>{usersList.length} users</Badge>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" data-testid="text-loading-users">Loading users...</p>
      ) : (
        <div className="border rounded-md divide-y max-h-[600px] overflow-auto">
          {usersList.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`user-row-${u.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {u.firstName || ""} {u.lastName || ""}
                  {!u.firstName && !u.lastName && <span className="text-muted-foreground italic">No name</span>}
                </p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <Badge className={isSA(u.role) ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" : ""}>
                  {ROLE_LABELS[u.role || ""] || u.role || "No role"}
                </Badge>
                <Badge className={u.status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}>
                  {u.status || "Unknown"}
                </Badge>
                {u.corporateAccessAdmin && <Badge>Corp. Access Admin</Badge>}
                {u.heymarketMemberId != null ? (
                  <Badge
                    className="cursor-pointer text-xs"
                    onClick={() => { setShowHeymarketDialog(u); setHeymarketIdInput(String(u.heymarketMemberId)); }}
                    data-testid={`badge-heymarket-id-${u.id}`}
                    title="Heymarket Member ID — click to edit"
                  >
                    HM #{u.heymarketMemberId}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() => { setShowHeymarketDialog(u); setHeymarketIdInput(""); }}
                    data-testid={`button-set-heymarket-${u.id}`}
                    title="Assign Heymarket member ID"
                  >
                    Set HM ID
                  </Button>
                )}
                {isSA(u.role) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { setShowRevokeDialog(u); setJustification(""); }}
                    data-testid={`button-revoke-sa-${u.id}`}
                  >
                    <UserMinus className="h-3 w-3 mr-1" />
                    Revoke SA
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowGrantDialog(u); setJustification(""); }}
                    data-testid={`button-grant-sa-${u.id}`}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    Grant SA
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!showGrantDialog} onOpenChange={() => setShowGrantDialog(null)}>
        <DialogContent data-testid="dialog-grant-sa">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Grant Super Admin Access
            </DialogTitle>
            <DialogDescription>
              You are about to grant Super Admin (platform-level) access to {showGrantDialog?.email}. 
              This gives full cross-tenant authority. Provide a justification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 border rounded-md bg-orange-50 dark:bg-orange-950">
              <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
              <p className="text-sm text-orange-800 dark:text-orange-200">
                Super Admin access grants unrestricted platform access. This action is fully audited and irreversible.
              </p>
            </div>
            <div>
              <Label>Justification</Label>
              <Textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain why this user needs Super Admin access..."
                data-testid="input-grant-justification"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowGrantDialog(null)} data-testid="button-cancel-grant">
              Cancel
            </Button>
            <Button
              onClick={() => showGrantDialog && grantSAMutation.mutate({ userId: showGrantDialog.id, justification })}
              disabled={justification.length < 5 || grantSAMutation.isPending}
              data-testid="button-confirm-grant"
            >
              {grantSAMutation.isPending ? "Granting..." : "Grant Super Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showRevokeDialog} onOpenChange={() => setShowRevokeDialog(null)}>
        <DialogContent data-testid="dialog-revoke-sa">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-destructive" />
              Revoke Super Admin Access
            </DialogTitle>
            <DialogDescription>
              You are about to revoke Super Admin access from {showRevokeDialog?.email}. 
              They will be downgraded to Admin role. Provide a justification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Justification</Label>
              <Textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain why this user's Super Admin access should be revoked..."
                data-testid="input-revoke-justification"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRevokeDialog(null)} data-testid="button-cancel-revoke">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showRevokeDialog && revokeSAMutation.mutate({ userId: showRevokeDialog.id, justification })}
              disabled={justification.length < 5 || revokeSAMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              {revokeSAMutation.isPending ? "Revoking..." : "Revoke Super Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showHeymarketDialog} onOpenChange={() => { setShowHeymarketDialog(null); setHeymarketIdInput(""); }}>
        <DialogContent data-testid="dialog-heymarket-member">
          <DialogHeader>
            <DialogTitle>Heymarket Sender Identity</DialogTitle>
            <DialogDescription>
              Assign a Heymarket member ID for <strong>{showHeymarketDialog?.email}</strong>.
              When this user sends a 1-to-1 SMS, it will appear from their Heymarket identity instead of the global sender.
              Leave blank to clear the assignment and fall back to the global creator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Heymarket Member ID</Label>
              <Input
                type="number"
                value={heymarketIdInput}
                onChange={(e) => setHeymarketIdInput(e.target.value)}
                placeholder="e.g. 171012"
                data-testid="input-heymarket-member-id"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find member IDs in Platform Admin → SMS Configuration → Fetch Team Members.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowHeymarketDialog(null); setHeymarketIdInput(""); }} data-testid="button-cancel-heymarket">
              Cancel
            </Button>
            {showHeymarketDialog?.heymarketMemberId != null && (
              <Button
                variant="outline"
                onClick={() => showHeymarketDialog && setHeymarketMemberMutation.mutate({ userId: showHeymarketDialog.id, heymarketMemberId: null })}
                disabled={setHeymarketMemberMutation.isPending}
                data-testid="button-clear-heymarket"
              >
                Clear
              </Button>
            )}
            <Button
              onClick={() => {
                if (!showHeymarketDialog) return;
                const parsed = heymarketIdInput.trim() ? parseInt(heymarketIdInput, 10) : null;
                if (heymarketIdInput.trim() && (isNaN(parsed!) || parsed! <= 0)) {
                  toast({ title: "Invalid member ID", description: "Must be a positive integer", variant: "destructive" });
                  return;
                }
                setHeymarketMemberMutation.mutate({ userId: showHeymarketDialog.id, heymarketMemberId: parsed });
              }}
              disabled={setHeymarketMemberMutation.isPending}
              data-testid="button-save-heymarket"
            >
              {setHeymarketMemberMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureTogglesTab() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newToggle, setNewToggle] = useState({ key: "", label: "", description: "", scope: "platform", enabled: false });

  const { data: toggles = [], isLoading } = useQuery<FeatureToggle[]>({
    queryKey: ["/api/platform/feature-toggles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newToggle) => {
      const res = await apiRequest("POST", "/api/platform/feature-toggles", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feature toggle created" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/feature-toggles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/audit-log"] });
      setShowCreateDialog(false);
      setNewToggle({ key: "", label: "", description: "", scope: "platform", enabled: false });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create toggle", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/platform/feature-toggles/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/feature-toggles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/audit-log"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update toggle", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/platform/feature-toggles/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feature toggle deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/feature-toggles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/audit-log"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete toggle", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4" data-testid="toggles-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Platform Feature Toggles</h3>
          <Badge>{toggles.length} toggles</Badge>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-toggle">
          <Plus className="h-4 w-4 mr-1" />
          Create Toggle
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" data-testid="text-loading-toggles">Loading feature toggles...</p>
      ) : toggles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <ToggleLeft className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No feature toggles configured yet</p>
            <Button variant="outline" onClick={() => setShowCreateDialog(true)} data-testid="button-create-toggle-empty">
              Create First Toggle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {toggles.map((toggle) => (
            <Card key={toggle.id} data-testid={`card-toggle-${toggle.id}`}>
              <CardContent className="flex items-center justify-between gap-4 pt-4 pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{toggle.label}</p>
                    <Badge variant="outline" className="font-mono text-xs">{toggle.key}</Badge>
                    <Badge>{toggle.scope}</Badge>
                  </div>
                  {toggle.description && (
                    <p className="text-sm text-muted-foreground mt-1">{toggle.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{toggle.enabled ? "On" : "Off"}</Label>
                    <Switch
                      checked={toggle.enabled}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: toggle.id, enabled: checked })}
                      data-testid={`switch-toggle-${toggle.id}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(toggle.id)}
                    data-testid={`button-delete-toggle-${toggle.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-toggle">
          <DialogHeader>
            <DialogTitle>Create Feature Toggle</DialogTitle>
            <DialogDescription>Add a new platform or account-level feature toggle.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Key</Label>
              <Input
                value={newToggle.key}
                onChange={(e) => setNewToggle(p => ({ ...p, key: e.target.value.replace(/\s+/g, "_").toLowerCase() }))}
                placeholder="e.g. enable_ai_features"
                data-testid="input-toggle-key"
              />
            </div>
            <div>
              <Label>Label</Label>
              <Input
                value={newToggle.label}
                onChange={(e) => setNewToggle(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. AI Features"
                data-testid="input-toggle-label"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newToggle.description}
                onChange={(e) => setNewToggle(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description..."
                data-testid="input-toggle-description"
              />
            </div>
            <div>
              <Label>Scope</Label>
              <Select value={newToggle.scope} onValueChange={(v) => setNewToggle(p => ({ ...p, scope: v }))}>
                <SelectTrigger data-testid="select-toggle-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">Platform</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Enabled by default</Label>
              <Switch
                checked={newToggle.enabled}
                onCheckedChange={(checked) => setNewToggle(p => ({ ...p, enabled: checked }))}
                data-testid="switch-toggle-default"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create-toggle">Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newToggle)}
              disabled={!newToggle.key || !newToggle.label || createMutation.isPending}
              data-testid="button-confirm-create-toggle"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditLogTab() {
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: logs = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["/api/platform/audit-log", categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/platform/audit-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  return (
    <div className="space-y-4" data-testid="audit-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Super Admin Audit Log</h3>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="select-audit-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="role_management">Role Management</SelectItem>
            <SelectItem value="tenant_management">Tenant Management</SelectItem>
            <SelectItem value="feature_management">Feature Management</SelectItem>
            <SelectItem value="system_override">System Override</SelectItem>
          </SelectContent>
        </Select>
        <Badge>{logs.length} entries</Badge>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" data-testid="text-loading-audit">Loading audit log...</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <ScrollText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No audit entries found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md divide-y max-h-[600px] overflow-auto">
          {logs.map((entry) => (
            <div key={entry.id} className="px-4 py-3 text-sm" data-testid={`audit-row-${entry.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{entry.action.replace(/_/g, " ")}</p>
                    <Badge className={CATEGORY_COLORS[entry.category] || ""}>
                      {entry.category.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    By: {entry.actorEmail}
                    {entry.targetLabel && <> | Target: {entry.targetLabel}</>}
                    {entry.targetType && <> ({entry.targetType})</>}
                  </p>
                  {entry.details && (
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                      <pre className="text-xs mt-1 p-2 bg-muted rounded-md overflow-auto max-w-full" data-testid={`audit-details-${entry.id}`}>
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Security Dashboard Tab (Super Admin Only) ─────────────────────────────────
type MetricPeriod = "daily" | "weekly" | "monthly";

const RISK_LEVEL_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  MODERATE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const SEVERITY_COLORS: Record<string, string> = {
  warning: "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
  high: "border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20",
  critical: "border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20",
};

function MetricCard({ label, value, sub, icon: Icon, highlight }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-orange-300 dark:border-orange-700" : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="shrink-0 p-2 rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<MetricPeriod>("weekly");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  const metricsQuery = useQuery<any>({
    queryKey: ["/api/admin/security/metrics", period],
    queryFn: () => fetch(`/api/admin/security/metrics?period=${period}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const alertsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/security/alerts"],
    queryFn: () => fetch("/api/admin/security/alerts", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const eventsQuery = useQuery<{ events: any[]; total: number }>({
    queryKey: ["/api/admin/security/events", eventTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (eventTypeFilter !== "all") params.set("event_type", eventTypeFilter);
      return fetch(`/api/admin/security/events?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const usersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/security/users"],
    queryFn: () => fetch("/api/admin/security/users", { credentials: "include" }).then(r => r.json()),
  });

  const ackAlertMutation = useMutation({
    mutationFn: (alertId: string) => apiRequest("POST", `/api/admin/security/alerts/${alertId}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: () => toast({ title: "Failed to acknowledge alert", variant: "destructive" }),
  });

  const unlockUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("POST", `/api/admin/security/users/${userId}/unlock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/users"] });
      toast({ title: "User unlocked and risk score reset" });
    },
    onError: () => toast({ title: "Failed to unlock user", variant: "destructive" }),
  });

  const m = metricsQuery.data;
  const alerts = alertsQuery.data ?? [];
  const events = eventsQuery.data?.events ?? [];
  const riskUsers = usersQuery.data ?? [];
  const highRiskUsers = riskUsers.filter(u => ["HIGH", "CRITICAL"].includes(u.securityRiskLevel));

  function formatTs(ts: string) {
    return new Date(ts).toLocaleString();
  }

  function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

  const EVENT_TYPES = [
    "all",
    "MFA_CHALLENGE_SENT",
    "MFA_CODE_VERIFIED_SUCCESS",
    "MFA_CODE_VERIFIED_FAILED",
    "MFA_CODE_EXPIRED",
    "MFA_RESENT",
    "MFA_LOCKOUT_TRIGGERED",
    "MFA_NOT_REQUIRED",
    "SECURITY_SUSPENDED",
    "SECURITY_UNSUSPENDED",
    "RISK_SCORE_ESCALATED",
  ];

  return (
    <div className="space-y-6" data-testid="security-tab">

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-sm">Active Security Alerts ({alerts.length})</h3>
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className={`rounded-md p-3 ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.warning}`} data-testid={`alert-${alert.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatTs(alert.createdAt)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ackAlertMutation.mutate(alert.id)}
                    disabled={ackAlertMutation.isPending}
                    data-testid={`button-ack-alert-${alert.id}`}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    Acknowledge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Period selector + Metrics grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">2FA Metrics</h3>
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as MetricPeriod[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
                data-testid={`button-period-${p}`}
                className="capitalize"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>

        {metricsQuery.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-4"><div className="h-12 animate-pulse bg-muted rounded" /></CardContent></Card>
            ))}
          </div>
        ) : m ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Challenges Sent" value={m.totalChallengesSent} icon={Activity} />
              <MetricCard label="Verifications OK" value={m.successfulVerifications} icon={CheckCircle} />
              <MetricCard label="Failed Verifications" value={m.failedVerifications} icon={XCircle} highlight={m.failedVerifications > 10} />
              <MetricCard label="Lockouts" value={m.lockouts} icon={Lock} highlight={m.lockouts > 3} />
              <MetricCard label="Resends" value={m.resends} icon={RotateCcw} />
              <MetricCard label="Expired Codes" value={m.expiredCodes} icon={Clock} />
              <MetricCard label="Not Required" value={m.notRequired} icon={Shield} />
              <MetricCard label="Avg Attempts/Success" value={m.avgAttemptsPerSuccess.toFixed(2)} icon={BarChart3} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Derived Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Friction Index</span>
                    <span className={`font-mono font-medium ${m.frictionIndex > 0.5 ? "text-orange-600 dark:text-orange-400" : ""}`}>{m.frictionIndex.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lockout Rate</span>
                    <span className={`font-mono font-medium ${m.lockoutRate > 0.05 ? "text-red-600 dark:text-red-400" : ""}`}>{fmtPct(m.lockoutRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expiry Rate</span>
                    <span className="font-mono font-medium">{fmtPct(m.expiryRate)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Enrollment Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Required Users</span>
                    <span className="font-medium">{m.requiredCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enrolled</span>
                    <span className="font-medium">{m.enrolledCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enrollment %</span>
                    <span className={`font-medium ${m.enrollmentPct < 80 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>{m.enrollmentPct}%</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">By Role Class</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {Object.entries(m.byRoleClass || {}).slice(0, 6).map(([role, cnt]) => (
                    <div key={role} className="flex justify-between">
                      <span className="text-muted-foreground truncate max-w-[140px]">{role}</span>
                      <span className="font-medium">{cnt as number}</span>
                    </div>
                  ))}
                  {Object.keys(m.byRoleClass || {}).length === 0 && (
                    <p className="text-muted-foreground italic">No events in period</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>

      {/* User Risk Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-sm">
              Elevated Risk Users
              {highRiskUsers.length > 0 && <Badge variant="destructive" className="ml-2">{highRiskUsers.length}</Badge>}
            </h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/security/users"] })} data-testid="button-refresh-users">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {riskUsers.filter(u => u.securityRiskScore > 0).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No users with elevated risk scores
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskUsers.filter(u => u.securityRiskScore > 0).map((u) => (
                  <TableRow key={u.id} data-testid={`row-risk-user-${u.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{u.role || "—"}</span></TableCell>
                    <TableCell><span className="font-mono font-bold tabular-nums">{u.securityRiskScore}</span></TableCell>
                    <TableCell>
                      <Badge className={RISK_LEVEL_COLORS[u.securityRiskLevel] || ""}>
                        {u.securityRiskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.mfaEnabled ? (
                        <Badge variant="outline" className="text-green-700 border-green-400">Enrolled</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Not Enrolled</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.securitySuspendedUntil && new Date(u.securitySuspendedUntil) > new Date() ? (
                        <Badge variant="destructive">
                          <Lock className="h-3 w-3 mr-1" />
                          Suspended
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Active</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.securitySuspendedUntil && new Date(u.securitySuspendedUntil) > new Date() && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unlockUserMutation.mutate(u.id)}
                          disabled={unlockUserMutation.isPending}
                          data-testid={`button-unlock-${u.id}`}
                        >
                          <Unlock className="h-3.5 w-3.5 mr-1.5" />
                          Unlock
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Event Log */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Security Event Log</h3>
            {eventsQuery.data && <span className="text-xs text-muted-foreground">({eventsQuery.data.total} total)</span>}
          </div>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-56" data-testid="select-event-type-filter">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((et) => (
                <SelectItem key={et} value={et}>{et === "all" ? "All Event Types" : et}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {eventsQuery.isLoading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Loading events...</CardContent></Card>
        ) : events.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No events found</CardContent></Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id} data-testid={`row-event-${e.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTs(e.ts)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        e.eventType.includes("FAILED") || e.eventType.includes("LOCKOUT") || e.eventType.includes("SUSPENDED")
                          ? "border-red-400 text-red-700 dark:text-red-400"
                          : e.eventType.includes("SUCCESS") || e.eventType.includes("UNSUSPENDED")
                          ? "border-green-400 text-green-700 dark:text-green-400"
                          : ""
                      }>
                        {e.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">{e.userId || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.roleClass || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{e.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}


function ClaimsDataPurgeTab() {
  const { toast } = useToast();
  const [phraseInput, setPhraseInput] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [result, setResult] = useState<any>(null);

  const REQUIRED_PHRASE = "PURGE ALL CLAIMS DATA";
  const phraseMatch = phraseInput.trim() === REQUIRED_PHRASE;
  const canExecute = phraseMatch && backupConfirmed;

  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = useQuery<{
    counts: Record<string, number>;
    totalChildRecords: number;
    totalRecords: number;
  }>({
    queryKey: ["/api/admin/purge-claims/preview"],
    staleTime: 0,
  });

  const purgeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/purge-claims", {
        confirmationPhrase: REQUIRED_PHRASE,
        backupConfirmed,
      }) as any;
    },
    onSuccess: (data: any) => {
      setResult(data);
      setPhraseInput("");
      setBackupConfirmed(false);
      refetchPreview();
      toast({ title: "Purge complete", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Purge failed", description: err.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const counts = preview?.counts ?? {};
  const countRows = [
    { label: "Accident / Claim Records", key: "accidents", isPrimary: true },
    { label: "Attachments", key: "accidentAttachments" },
    { label: "Carrier Submission Events", key: "carrierSubmissionEvents" },
    { label: "Deletion Override Requests", key: "deletionOverrideRequests" },
    { label: "Category Metadata", key: "accidentCategoryMeta" },
    { label: "Claim State Events", key: "claimEvents" },
    { label: "Claim Audit Logs", key: "claimAuditLogs" },
    { label: "Claim Recoveries", key: "claimRecoveries" },
    { label: "Recovery Audit Logs", key: "claimRecoveryAuditLogs" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" data-testid="text-dataops-title">Data Operations</h2>
        <p className="text-sm text-muted-foreground mt-1">Controlled data operations for Super Admins only. These actions are irreversible.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-destructive" />
            <CardTitle>Claims Module — Full Data Purge</CardTitle>
          </div>
          <CardDescription>
            Permanently remove all Claims data prior to historical import. This action cascades to all related tables and is irreversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {result ? (
            <div className="rounded-md border border-green-500/30 bg-green-50 dark:bg-green-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                <CheckCircle className="h-4 w-4" />
                Purge Completed Successfully
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>{result.totalPurged?.toLocaleString()}</strong> total records deleted.
                {" "}Executed at: {new Date(result.executedAt).toLocaleString()}.
                {result.filesAttempted > 0 && (
                  <span>
                    {" "}{result.filesAttempted} attachment files processed
                    {result.fileCleanupErrors > 0
                      ? ` (${result.fileCleanupErrors} file cleanup errors logged).`
                      : " (all cleaned up)."}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {Object.entries(result.purgedCounts ?? {}).map(([k, v]) => (
                  <span key={k}>{k}: <strong>{String(v)}</strong></span>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setResult(null)} data-testid="button-purge-reset">
                Run Another Purge
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium mb-3">Current Record Counts (Live)</h3>
                {previewLoading ? (
                  <p className="text-sm text-muted-foreground">Loading counts...</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Table</TableHead>
                          <TableHead className="text-right">Records to Delete</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {countRows.map((row) => (
                          <TableRow key={row.key} data-testid={`row-count-${row.key}`}>
                            <TableCell className={row.isPrimary ? "font-medium" : "text-muted-foreground text-sm pl-6"}>
                              {row.isPrimary ? "" : "\u21b3 "}{row.label}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {(counts[row.key] ?? 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold bg-muted/30">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{(preview?.totalRecords ?? 0).toLocaleString()}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-4">
                <div className="flex items-start gap-2 text-destructive text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  This operation is permanent and cannot be undone. Complete all three steps below.
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="backup-confirm">Step 1 — Confirm backup is complete</Label>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="backup-confirm"
                      checked={backupConfirmed}
                      onCheckedChange={(checked) => setBackupConfirmed(!!checked)}
                      data-testid="checkbox-backup-confirmed"
                    />
                    <label htmlFor="backup-confirm" className="text-sm text-muted-foreground cursor-pointer">
                      I confirm a full backup of the Claims dataset has been completed and stored securely.
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="purge-phrase">Step 2 — Type the confirmation phrase exactly</Label>
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1 inline-block">{REQUIRED_PHRASE}</p>
                  <Input
                    id="purge-phrase"
                    value={phraseInput}
                    onChange={(e) => setPhraseInput(e.target.value)}
                    placeholder="Type the confirmation phrase above"
                    className={phraseInput.length > 0 ? (phraseMatch ? "border-green-500" : "border-destructive") : ""}
                    data-testid="input-purge-phrase"
                    autoComplete="off"
                  />
                  {phraseInput.length > 0 && !phraseMatch && (
                    <p className="text-xs text-destructive">Phrase does not match. Check spacing and capitalization.</p>
                  )}
                  {phraseMatch && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Phrase confirmed
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Step 3 — Execute purge</Label>
                  <p className="text-xs text-muted-foreground">
                    This will delete all {(preview?.counts.accidents ?? 0).toLocaleString()} claim records and {(preview?.totalChildRecords ?? 0).toLocaleString()} child records.
                    All attachment files will be removed from storage. An immutable audit log entry will be recorded.
                  </p>
                  <Button
                    variant="destructive"
                    disabled={!canExecute || purgeMutation.isPending}
                    onClick={() => purgeMutation.mutate()}
                    data-testid="button-execute-purge"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {purgeMutation.isPending ? "Purging..." : "Execute Claims Data Purge"}
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

// ── Report Delivery Control Tab ──────────────────────────────────────────────
interface ReportSchedule {
  sendDay:          string;
  sendTime:         string;
  tzRule:           string;
  activeCron:       string;
  lastRun:          string | null;
  emailsSent:       number;
  accountsAttempted:number;
  errors:           number;
  nextScheduledRun: string;
  recentRuns: {
    report_week:   string;
    ran_at:        string;
    accounts:      number;
    emails_sent:   number;
    errors:        number;
    triggered_by:  string;
  }[];
}

const DAYS_OF_WEEK = [
  { value: "sunday",    label: "Sunday" },
  { value: "monday",    label: "Monday" },
  { value: "tuesday",   label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday",  label: "Thursday" },
  { value: "friday",    label: "Friday" },
  { value: "saturday",  label: "Saturday" },
];

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short",
  });
}

function fmtReportWeek(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  // dateStr is a date like "2025-04-07"
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ReportDeliveryTab() {
  const { toast } = useToast();

  const { data: schedule, isLoading, refetch } = useQuery<ReportSchedule>({
    queryKey: ["/api/platform/report-schedule"],
    queryFn: () => fetch("/api/platform/report-schedule", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const [sendDay,  setSendDay]  = useState<string>("");
  const [sendTime, setSendTime] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  // Populate fields once data loads
  const localDay  = dirty ? sendDay  : (schedule?.sendDay  ?? "monday");
  const localTime = dirty ? sendTime : (schedule?.sendTime ?? "07:05");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/platform/report-schedule", { sendDay: localDay, sendTime: localTime })
        .then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Schedule saved", description: "Global report schedule updated." });
      setDirty(false);
      refetch();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reports/weekly/run-delivery", {}).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Manual send triggered", description: "Delivery job queued." });
      refetch();
    },
    onError: () => toast({ title: "Trigger failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Report Delivery Control</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Set the global weekly report schedule. All enabled accounts will receive reports on this day and time,
          regardless of their individual schedule fields. Account-level settings still control recipients and on/off.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              Last Run
            </div>
            <p className="text-sm font-medium" data-testid="text-last-run">
              {isLoading ? "Loading…" : fmtDateShort(schedule?.lastRun)}
            </p>
            {schedule?.accountsAttempted != null && schedule.accountsAttempted > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {schedule.accountsAttempted} account{schedule.accountsAttempted !== 1 ? "s" : ""} attempted
                {schedule.errors > 0 && <span className="text-destructive"> · {schedule.errors} error{schedule.errors !== 1 ? "s" : ""}</span>}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MailCheck className="h-3.5 w-3.5" />
              Emails Sent (Last Run)
            </div>
            <p className="text-sm font-medium" data-testid="text-emails-sent">
              {isLoading ? "Loading…" : (schedule?.emailsSent ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Next Scheduled Run
            </div>
            <p className="text-sm font-medium" data-testid="text-next-run">
              {isLoading ? "Loading…" : fmtDateShort(schedule?.nextScheduledRun)}
            </p>
            {schedule?.activeCron && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{schedule.activeCron}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Global schedule editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Send Schedule</CardTitle>
          <CardDescription>
            Controls when the automated weekly report batch fires. Changing this takes effect immediately — no restart required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="report-send-day">Send Day</Label>
              <Select
                value={localDay}
                onValueChange={v => { setSendDay(v); setDirty(true); }}
              >
                <SelectTrigger id="report-send-day" data-testid="select-send-day">
                  <SelectValue placeholder="Select day…" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-send-time">Send Time (CST)</Label>
              <Input
                id="report-send-time"
                type="time"
                value={localTime}
                onChange={e => { setSendTime(e.target.value); setDirty(true); }}
                data-testid="input-send-time"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty}
              data-testid="button-save-schedule"
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving…" : "Save Schedule"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              data-testid="button-trigger-delivery"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {triggerMutation.isPending ? "Triggering…" : "Run Now"}
            </Button>
          </div>

          <div className="mt-4 rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground">
            <strong>Timezone:</strong> All sends execute in <strong>America/Chicago (CST/CDT)</strong> regardless of account location.
            Account-level "Time Zone" fields are informational only and are not used for scheduling.
          </div>
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Batch Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Week</TableHead>
                <TableHead>Ran At (CST)</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Emails Sent</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : !schedule?.recentRuns?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No batch history yet.</TableCell>
                </TableRow>
              ) : (
                schedule.recentRuns.map((run, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{fmtReportWeek(run.report_week)}</TableCell>
                    <TableCell className="text-sm">{fmtDateShort(run.ran_at)}</TableCell>
                    <TableCell>
                      <Badge variant={run.triggered_by === "manual" ? "outline" : "secondary"} className="text-[10px]">
                        {run.triggered_by === "manual" ? "Manual" : "Scheduler"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{Number(run.accounts).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{Number(run.emails_sent).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(run.errors) > 0
                        ? <span className="text-destructive font-medium">{Number(run.errors).toLocaleString()}</span>
                        : <span className="text-muted-foreground">0</span>
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* WIW Mapping Health shortcut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            WIW Location Mapping Health
          </CardTitle>
          <CardDescription>
            Detect stale or conflicting WIW location→account mappings that cause blank schedule PDFs.
            Checks for mismatches between <code className="text-xs bg-muted px-1 rounded">wiw_locations.account_id</code> and the legacy mapping table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { window.location.href = "/admin/wiw-mapping-health"; }}
            data-testid="button-open-wiw-mapping-health"
          >
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Open Mapping Health Check
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Communications Tab (Heymarket SMS + Provider Config) ─────────────────────

interface SmsStatus {
  apiTokenPresent:    boolean;
  inboxIdPresent:     boolean;
  inboxId:            number | null;
  creatorId:          number | null;
  featureFlagEnabled: boolean;
  ready:              boolean;
}

interface SmsTotals {
  sent:       string;
  failed:     string;
  pending:    string;
  last_7_days: string;
  last_30_days: string;
  bulk_sends: string;
}

interface BulkSendRow {
  bulk_send_id:   string;
  sent_at:        string;
  recipients:     string;
  sent:           string;
  failed:         string;
  context_module: string;
  sample_name:    string;
}

interface SmsStats {
  totals: SmsTotals;
  recentBulkSends: BulkSendRow[];
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${ok ? "bg-green-500" : "bg-destructive"}`} />
  );
}

function CommunicationsTab() {
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<SmsStatus>({
    queryKey: ["/api/platform/sms/status"],
    queryFn: () => fetch("/api/platform/sms/status", { credentials: "include" }).then(r => r.json()),
    staleTime: 15_000,
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<SmsStats>({
    queryKey: ["/api/platform/sms/stats"],
    queryFn: () => fetch("/api/platform/sms/stats", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const [inboxId, setInboxId]         = useState<string>("");
  const [creatorId, setCreatorId]     = useState<string>("");
  const [flagEnabled, setFlagEnabled] = useState<boolean>(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [gcRecruiting, setGcRecruiting] = useState<string>("");
  const [gcDispatch, setGcDispatch]     = useState<string>("");
  const [gcSupport, setGcSupport]       = useState<string>("");

  // Inbox picker — fetched on demand from Heymarket
  const [inboxList, setInboxList]           = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [inboxListLoading, setInboxListLoading] = useState(false);
  const [inboxListError, setInboxListError] = useState<string | null>(null);
  const [inboxListHint, setInboxListHint]   = useState<string | null>(null);

  // Creator picker — fetched on demand from Heymarket
  const [creatorList, setCreatorList]           = useState<{ id: number; name: string; email: string | null }[]>([]);
  const [creatorListLoading, setCreatorListLoading] = useState(false);
  const [creatorListError, setCreatorListError] = useState<string | null>(null);
  const [creatorListHint, setCreatorListHint]   = useState<string | null>(null);

  async function fetchInboxes() {
    setInboxListLoading(true);
    setInboxListError(null);
    setInboxListHint(null);
    try {
      const r = await fetch("/api/platform/sms/inboxes", { credentials: "include" });
      const d = await r.json();
      if (r.status === 422 && d.message === "inbox_lookup_unavailable") {
        setInboxListHint(d.hint ?? "Could not auto-detect inbox. Enter the ID manually.");
        return;
      }
      if (!r.ok) throw new Error(d.message ?? "Failed to fetch inboxes");
      setInboxList(d.inboxes ?? []);
    } catch (e: any) {
      setInboxListError(e.message);
    } finally {
      setInboxListLoading(false);
    }
  }

  async function fetchCreators() {
    setCreatorListLoading(true);
    setCreatorListError(null);
    setCreatorListHint(null);
    try {
      const r = await fetch("/api/platform/sms/creators", { credentials: "include" });
      const d = await r.json();
      if (r.status === 422 && d.message === "creator_lookup_unavailable") {
        setCreatorListHint(d.hint ?? "Could not auto-detect creators. Enter the ID manually.");
        return;
      }
      if (!r.ok) throw new Error(d.message ?? "Failed to fetch creators");
      setCreatorList(d.members ?? []);
    } catch (e: any) {
      setCreatorListError(e.message);
    } finally {
      setCreatorListLoading(false);
    }
  }

  const [testPhone,   setTestPhone]   = useState("");
  const [testMessage, setTestMessage] = useState("Hello from DriverHub 360 — this is a test message.");

  // Populate inputs when status loads
  const localInboxId   = configDirty ? inboxId   : (status?.inboxId   != null ? String(status.inboxId)   : "");
  const localCreatorId = configDirty ? creatorId : (status?.creatorId != null ? String(status.creatorId) : "");
  const localFlag      = configDirty ? flagEnabled : (status?.featureFlagEnabled ?? false);
  const localGcRecruiting = configDirty ? gcRecruiting : (status?.groupCreators?.recruiting != null ? String(status.groupCreators.recruiting) : "");
  const localGcDispatch   = configDirty ? gcDispatch   : (status?.groupCreators?.dispatch   != null ? String(status.groupCreators.dispatch)   : "");
  const localGcSupport    = configDirty ? gcSupport    : (status?.groupCreators?.support    != null ? String(status.groupCreators.support)    : "");

  const configMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/platform/sms/config", {
        inboxId:            localInboxId   ? parseInt(localInboxId, 10)   : undefined,
        creatorId:          localCreatorId ? parseInt(localCreatorId, 10) : null,
        featureFlagEnabled: localFlag,
        groupCreators: {
          recruiting: localGcRecruiting ? parseInt(localGcRecruiting, 10) : null,
          dispatch:   localGcDispatch   ? parseInt(localGcDispatch, 10)   : null,
          support:    localGcSupport    ? parseInt(localGcSupport, 10)    : null,
        },
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Config saved" });
      setConfigDirty(false);
      refetchStatus();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/platform/sms/test", { toPhone: testPhone, message: testMessage }).then(r => r.json()),
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Test SMS sent", description: `Message ID: ${data.messageId ?? "—"}` });
      } else {
        toast({ title: "Test SMS failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
      refetchStats();
    },
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
  });

  // ── User Mappings state ──────────────────────────────────────────────────
  const { data: userMappingsData, refetch: refetchMappings, isLoading: mappingsLoading } = useQuery<{
    mappings: Array<{
      id: number;
      driverhub_user_id: string;
      heymarket_user_id: number;
      driverhub_email: string | null;
      heymarket_email: string | null;
      heymarket_name: string | null;
      matched_by: string;
      is_active: boolean;
      last_verified_at: string | null;
      driverhub_email_live: string;
      driverhub_first_name: string | null;
      driverhub_last_name: string | null;
    }>;
  }>({ queryKey: ["/api/platform/sms/user-mappings"] });

  const syncMappingsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/platform/sms/user-mappings/sync").then(r => r.json()),
    onSuccess: (data: any) => {
      const unmatchedHm: number = data.unmatchedHeymarket?.length ?? data.skipped ?? 0;
      toast({
        title: "Email sync complete",
        description: `${data.matched} matched · ${data.skipped} DriverHub unmatched · ${unmatchedHm} Heymarket unmatched`,
      });
      refetchMappings();
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (driverHubUserId: string) =>
      apiRequest("DELETE", `/api/platform/sms/user-mappings/${driverHubUserId}`),
    onSuccess: () => { toast({ title: "Mapping removed" }); refetchMappings(); },
    onError: () => toast({ title: "Remove failed", variant: "destructive" }),
  });

  const [manualMapDialog, setManualMapDialog] = useState<{
    driverHubUserId: string;
    email: string;
    name: string;
  } | null>(null);
  const [manualHmId, setManualHmId] = useState("");
  const [manualHmName, setManualHmName] = useState("");

  const saveManualMappingMutation = useMutation({
    mutationFn: ({ driverHubUserId, heymarketUserId, heymarketName }: {
      driverHubUserId: string; heymarketUserId: number; heymarketName: string;
    }) =>
      apiRequest("PUT", `/api/platform/sms/user-mappings/${driverHubUserId}`, { heymarketUserId, heymarketName, heymarketEmail: null, matchedBy: "manual" }),
    onSuccess: () => {
      toast({ title: "Mapping saved" });
      setManualMapDialog(null);
      setManualHmId("");
      setManualHmName("");
      refetchMappings();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // ── Email Template Editor state ────────────────────────────────────────────
  const { data: commTemplates = [], refetch: refetchTemplates } = useQuery<any[]>({
    queryKey: ["/api/platform/comm/templates"],
    queryFn: () => fetch("/api/platform/comm/templates", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateActive, setTemplateActive] = useState(true);
  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/platform/comm/templates/${editingTemplate?.slug}`, {
        subject: templateSubject,
        body_html: templateBody,
        active: templateActive,
      }),
    onSuccess: () => {
      toast({ title: "Template saved" });
      setEditingTemplate(null);
      refetchTemplates();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // ── Recipient Rules state ──────────────────────────────────────────────────
  const { data: recipientRules = [], refetch: refetchRules } = useQuery<any[]>({
    queryKey: ["/api/platform/comm/recipient-rules"],
    queryFn: () => fetch("/api/platform/comm/recipient-rules", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
  const [addEmailForEvent, setAddEmailForEvent] = useState<string | null>(null);
  const [addEmailValue, setAddEmailValue] = useState("");
  const [addEmailError, setAddEmailError] = useState("");
  const addRuleMutation = useMutation({
    mutationFn: (payload: { event_slug: string; email: string }) =>
      apiRequest("POST", "/api/platform/comm/recipient-rules", {
        event_slug: payload.event_slug, channel: "email",
        recipient_type: "email", recipient_value: payload.email, enabled: true,
      }),
    onSuccess: () => {
      toast({ title: "Email address added" });
      setAddEmailForEvent(null);
      setAddEmailValue("");
      setAddEmailError("");
      refetchRules();
    },
    onError: () => toast({ title: "Failed to add email", variant: "destructive" }),
  });
  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/platform/comm/recipient-rules/${id}`),
    onSuccess: () => { toast({ title: "Email removed" }); refetchRules(); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });
  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/platform/comm/recipient-rules/${id}`, { enabled }),
    onSuccess: () => refetchRules(),
  });

  const CLAIM_EVENTS = [
    { slug: "CLAIM_CREATED", label: "Claim Created", description: "Sent when a new claim is submitted." },
    { slug: "CLAIM_UPDATED", label: "Claim Status Updated", description: "Sent when a claim's status changes." },
  ];

  const handleAddEmail = (eventSlug: string) => {
    const email = addEmailValue.trim();
    if (!email) { setAddEmailError("Email is required."); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { setAddEmailError("Enter a valid email address."); return; }
    const already = recipientRules.some(
      (r: any) => r.event_slug === eventSlug && r.recipient_type === "email" &&
        r.recipient_value?.toLowerCase() === email.toLowerCase()
    );
    if (already) { setAddEmailError("This address is already on the list."); return; }
    setAddEmailError("");
    addRuleMutation.mutate({ event_slug: eventSlug, email });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Communications Framework</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure outbound SMS via Heymarket. SMS is gated behind a feature flag so it can be built
          and tested before going live. All outbound attempts are logged per recipient.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Heymarket Status</p>
            {statusLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-1 text-sm">
                <div className="flex items-center">
                  <StatusDot ok={!!status?.apiTokenPresent} />
                  {status?.apiTokenPresent ? "API token present" : "API token missing"}
                </div>
                <div className="flex items-center">
                  <StatusDot ok={!!status?.inboxIdPresent} />
                  {status?.inboxIdPresent ? `Inbox ID: ${status?.inboxId}` : "Inbox ID not set"}
                </div>
                <div className="flex items-center">
                  <StatusDot ok={status?.creatorId != null} />
                  {status?.creatorId != null ? `Creator ID: ${status.creatorId}` : "Creator ID not set (no signature control)"}
                </div>
                <div className="flex items-center">
                  <StatusDot ok={!!status?.featureFlagEnabled} />
                  {status?.featureFlagEnabled ? "SMS feature enabled" : "SMS feature disabled"}
                </div>
                <div className="flex items-center pt-1 border-t mt-2">
                  <StatusDot ok={!!status?.ready} />
                  <strong>{status?.ready ? "Ready to send" : "Not ready"}</strong>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Last 30 Days</p>
            {statsLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="font-medium">{Number(stats?.totals?.sent ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="font-medium text-destructive">{Number(stats?.totals?.failed ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{Number(stats?.totals?.pending ?? 0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Bulk Send Activity</p>
            {statsLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total bulk sends</span>
                  <span className="font-medium">{Number(stats?.totals?.bulk_sends ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last 7 days</span>
                  <span className="font-medium">{Number(stats?.totals?.last_7_days ?? 0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* API token notice */}
      {!status?.apiTokenPresent && !statusLoading && (
        <div className="flex items-start gap-2.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">HEYMARKET_API_TOKEN not set</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Add <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">HEYMARKET_API_TOKEN</code> as an
              environment secret in the Replit Secrets panel. The Heymarket API token is never stored in the database.
            </p>
          </div>
        </div>
      )}

      {/* Config form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Configuration</CardTitle>
          <CardDescription>
            The API token must be set as an environment secret. Inbox ID and feature flag are stored in platform config.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="sms-inbox-id">Heymarket Inbox ID</Label>
              {inboxList.length > 0 ? (
                <Select
                  value={localInboxId}
                  onValueChange={v => { setInboxId(v); setConfigDirty(true); }}
                >
                  <SelectTrigger id="sms-inbox-id" data-testid="select-heymarket-inbox">
                    <SelectValue placeholder="Select an inbox" />
                  </SelectTrigger>
                  <SelectContent>
                    {inboxList.map(inbox => (
                      <SelectItem key={inbox.id} value={String(inbox.id)}>
                        {inbox.name}{inbox.phone ? ` — ${inbox.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="sms-inbox-id"
                    type="number"
                    placeholder="e.g. 12345"
                    value={localInboxId}
                    onChange={e => { setInboxId(e.target.value); setConfigDirty(true); }}
                    data-testid="input-heymarket-inbox-id"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchInboxes}
                    disabled={inboxListLoading}
                    data-testid="button-fetch-inboxes"
                    className="whitespace-nowrap"
                  >
                    {inboxListLoading ? "Loading…" : "Fetch Inboxes"}
                  </Button>
                </div>
              )}
              {inboxList.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInboxList([])}
                  className="text-xs h-auto py-0 px-0 text-muted-foreground"
                >
                  Enter ID manually
                </Button>
              )}
              {inboxListError && (
                <p className="text-xs text-destructive">{inboxListError}</p>
              )}
              {inboxListHint && (
                <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">{inboxListHint}</p>
              )}
              {!inboxListHint && (
                <p className="text-xs text-muted-foreground">
                  {inboxList.length > 0 ? "Select an inbox from your Heymarket account." : "Click \"Fetch Inboxes\" to auto-detect, or enter the ID manually."}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sms-creator-id">Heymarket Creator ID</Label>
              {creatorList.length > 0 ? (
                <Select
                  value={localCreatorId}
                  onValueChange={v => { setCreatorId(v); setConfigDirty(true); }}
                >
                  <SelectTrigger id="sms-creator-id" data-testid="select-heymarket-creator">
                    <SelectValue placeholder="Select a team member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {creatorList.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}{m.email ? ` (${m.email})` : ""} — ID {m.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="sms-creator-id"
                  type="number"
                  placeholder="e.g. 54321"
                  value={localCreatorId}
                  onChange={e => { setCreatorId(e.target.value); setConfigDirty(true); }}
                  data-testid="input-heymarket-creator-id"
                />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchCreators}
                  disabled={creatorListLoading}
                  data-testid="button-fetch-creators"
                >
                  {creatorListLoading ? "Loading…" : "Fetch Team Members"}
                </Button>
                {creatorList.length > 0 && (
                  <span className="text-xs text-muted-foreground">{creatorList.length} member(s) found</span>
                )}
              </div>
              {creatorListError && (
                <p className="text-xs text-destructive">{creatorListError}</p>
              )}
              {creatorListHint && (
                <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">{creatorListHint}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The Heymarket user ID whose identity (name and auto-signature) appears on outbound texts.
                Click "Fetch Team Members" to auto-detect, or enter the ID manually.{" "}
                <strong className="text-foreground">Required</strong> — some Heymarket inboxes will reject sends without a valid creator ID.
              </p>
            </div>

            {/* Group Signatures — creator IDs for bulk sends by role */}
            <div className="space-y-2 border-t pt-4">
              <Label>Group Signature Creator IDs</Label>
              <p className="text-xs text-muted-foreground">
                When a bulk SMS is sent, the selected group signature determines which Heymarket user identity is used as the sender.
                Enter the Heymarket member ID for each group signature below. Click <strong className="text-foreground">Fetch Team Members</strong> above first to look up IDs.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gc-recruiting">
                    Recruiting - Driver on Demand
                  </label>
                  <Input
                    id="gc-recruiting"
                    type="number"
                    placeholder="Heymarket member ID"
                    value={localGcRecruiting}
                    onChange={e => { setGcRecruiting(e.target.value); setConfigDirty(true); }}
                    data-testid="input-gc-recruiting"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gc-dispatch">
                    Dispatch - Driver on Demand
                  </label>
                  <Input
                    id="gc-dispatch"
                    type="number"
                    placeholder="Heymarket member ID"
                    value={localGcDispatch}
                    onChange={e => { setGcDispatch(e.target.value); setConfigDirty(true); }}
                    data-testid="input-gc-dispatch"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gc-support">
                    Support - Driver on Demand
                  </label>
                  <Input
                    id="gc-support"
                    type="number"
                    placeholder="Heymarket member ID"
                    value={localGcSupport}
                    onChange={e => { setGcSupport(e.target.value); setConfigDirty(true); }}
                    data-testid="input-gc-support"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>SMS Feature Flag</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  id="sms-flag"
                  checked={localFlag}
                  onCheckedChange={v => { setFlagEnabled(v); setConfigDirty(true); }}
                  data-testid="switch-sms-flag"
                />
                <label htmlFor="sms-flag" className="text-sm select-none cursor-pointer">
                  {localFlag ? "SMS enabled — live sends active" : "SMS disabled — logging only"}
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => configMutation.mutate()}
              disabled={configMutation.isPending || !configDirty}
              data-testid="button-save-sms-config"
            >
              {configMutation.isPending ? "Saving…" : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Test SMS</CardTitle>
          <CardDescription>
            Verify Heymarket connectivity by sending a test message. Requires API token and inbox ID to be configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="test-phone">To Phone Number</Label>
              <Input
                id="test-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                data-testid="input-test-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-message">Message</Label>
              <Input
                id="test-message"
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                data-testid="input-test-message"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !testPhone.trim() || !testMessage.trim()}
              data-testid="button-send-test-sms"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {testMutation.isPending ? "Sending…" : "Send Test SMS"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User → Heymarket Mappings */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">User → Heymarket Mappings</CardTitle>
              <CardDescription className="mt-0.5">
                Maps each DriverHub user to their Heymarket identity by email so 1:1 texts are attributed
                to the correct team member with their personal signature. Shared sending line is unchanged.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMappingsMutation.mutate()}
              disabled={syncMappingsMutation.isPending}
              data-testid="button-sync-heymarket-mappings"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {syncMappingsMutation.isPending ? "Syncing…" : "Sync by Email"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {mappingsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading mappings…</div>
          ) : !userMappingsData?.mappings?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground px-4">
              No mappings yet. Click <strong>Sync by Email</strong> to auto-match DriverHub users to
              Heymarket team members by email address, or add mappings manually.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DriverHub User</TableHead>
                  <TableHead>Heymarket Member</TableHead>
                  <TableHead>Matched By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {userMappingsData.mappings.map(m => {
                  const displayEmail = m.driverhub_email ?? m.driverhub_email_live;
                  return (
                  <TableRow key={m.id} data-testid={`row-hm-mapping-${m.id}`}>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {[m.driverhub_first_name, m.driverhub_last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{displayEmail}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{m.heymarket_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.heymarket_email ?? ""}{m.heymarket_email ? " · " : ""}ID {m.heymarket_user_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {m.matched_by === "email" ? "Email" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? "default" : "destructive"} className="text-[10px]">
                        {m.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-hm-verified-${m.id}`}>
                        {m.last_verified_at
                          ? new Date(m.last_verified_at).toLocaleDateString()
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setManualMapDialog({ driverHubUserId: m.driverhub_user_id, email: displayEmail, name: [m.driverhub_first_name, m.driverhub_last_name].filter(Boolean).join(" ") || displayEmail });
                            setManualHmId(String(m.heymarket_user_id));
                            setManualHmName(m.heymarket_name ?? "");
                          }}
                          data-testid={`button-edit-hm-mapping-${m.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMappingMutation.mutate(m.driverhub_user_id)}
                          disabled={deleteMappingMutation.isPending}
                          data-testid={`button-delete-hm-mapping-${m.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Manual Mapping Dialog */}
      <Dialog open={!!manualMapDialog} onOpenChange={open => { if (!open) { setManualMapDialog(null); setManualHmId(""); setManualHmName(""); } }}>
        <DialogContent data-testid="dialog-manual-hm-mapping">
          <DialogHeader>
            <DialogTitle>Set Heymarket Mapping</DialogTitle>
            <DialogDescription>
              Manually map <strong>{manualMapDialog?.name}</strong> ({manualMapDialog?.email}) to their Heymarket member ID.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Heymarket Member ID</Label>
              <Input
                type="number"
                placeholder="e.g. 54321"
                value={manualHmId}
                onChange={e => setManualHmId(e.target.value)}
                data-testid="input-manual-hm-id"
              />
              <p className="text-xs text-muted-foreground">
                Find this in Heymarket Admin → Team. It is the numeric ID shown for each member.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Display Name (optional)</Label>
              <Input
                placeholder="e.g. Jane Smith"
                value={manualHmName}
                onChange={e => setManualHmName(e.target.value)}
                data-testid="input-manual-hm-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setManualMapDialog(null); setManualHmId(""); setManualHmName(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const parsed = parseInt(manualHmId, 10);
                if (!manualMapDialog || isNaN(parsed) || parsed <= 0) return;
                saveManualMappingMutation.mutate({ driverHubUserId: manualMapDialog.driverHubUserId, heymarketUserId: parsed, heymarketName: manualHmName.trim() || `Member ${parsed}` });
              }}
              disabled={saveManualMappingMutation.isPending || !manualHmId.trim()}
              data-testid="button-save-manual-hm-mapping"
            >
              {saveManualMappingMutation.isPending ? "Saving…" : "Save Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent bulk sends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Bulk Sends</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent At</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Sample Recipient</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : !stats?.recentBulkSends?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No bulk sends yet.</TableCell>
                </TableRow>
              ) : (
                stats.recentBulkSends.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{fmtDateShort(row.sent_at)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {row.context_module?.replace(/_/g, " ") ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sample_name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{Number(row.recipients).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{Number(row.sent).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(row.failed) > 0
                        ? <span className="text-destructive font-medium">{Number(row.failed).toLocaleString()}</span>
                        : <span className="text-muted-foreground">0</span>
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Email Templates ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Templates</CardTitle>
          <CardDescription>
            Edit the subject and HTML body for each automated email event. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No templates found</TableCell>
                </TableRow>
              ) : commTemplates.map((t: any) => (
                <TableRow key={t.slug}>
                  <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                  <TableCell className="text-sm">{t.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{t.subject}</TableCell>
                  <TableCell>
                    <Badge variant={t.active ? "default" : "secondary"} className="text-[10px]">
                      {t.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-edit-template-${t.slug}`}
                      onClick={() => {
                        setEditingTemplate(t);
                        setTemplateSubject(t.subject || "");
                        setTemplateBody(t.body_html || "");
                        setTemplateActive(t.active ?? true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Template edit dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={open => { if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template — {editingTemplate?.slug}</DialogTitle>
            <DialogDescription>
              Use <code className="text-xs bg-muted px-1 rounded">{"{{variable}}"}</code> for dynamic values.
              Available variables: {editingTemplate?.variables?.join(", ") || "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-subject">Subject</Label>
              <Input
                id="tmpl-subject"
                value={templateSubject}
                onChange={e => setTemplateSubject(e.target.value)}
                placeholder="Email subject line"
                data-testid="input-template-subject"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-body">HTML Body</Label>
              <Textarea
                id="tmpl-body"
                value={templateBody}
                onChange={e => setTemplateBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder="<html>...</html>"
                data-testid="input-template-body"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tmpl-active"
                checked={templateActive}
                onCheckedChange={setTemplateActive}
                data-testid="switch-template-active"
              />
              <Label htmlFor="tmpl-active">Active (sends email when triggered)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)} data-testid="button-cancel-template">Cancel</Button>
            <Button
              onClick={() => saveTemplateMutation.mutate()}
              disabled={saveTemplateMutation.isPending}
              data-testid="button-save-template"
            >
              {saveTemplateMutation.isPending ? "Saving…" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Recipient Rules ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Claim Notification Emails</CardTitle>
          <CardDescription className="mt-0.5">
            Email addresses listed here are notified automatically when claims activity occurs.
            Each address can be individually toggled on or off without being removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {CLAIM_EVENTS.map(evt => {
            const eventRules = recipientRules.filter(
              (r: any) => r.event_slug === evt.slug && r.recipient_type === "email"
            );
            const isAdding = addEmailForEvent === evt.slug;

            return (
              <div key={evt.slug} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{evt.label}</p>
                    <p className="text-xs text-muted-foreground">{evt.description}</p>
                  </div>
                  {!isAdding && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddEmailForEvent(evt.slug);
                        setAddEmailValue("");
                        setAddEmailError("");
                      }}
                      data-testid={`button-add-email-${evt.slug}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Email
                    </Button>
                  )}
                </div>

                {/* Inline add form */}
                {isAdding && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        type="email"
                        placeholder="name@example.com"
                        value={addEmailValue}
                        onChange={e => { setAddEmailValue(e.target.value); if (addEmailError) setAddEmailError(""); }}
                        onKeyDown={e => { if (e.key === "Enter") handleAddEmail(evt.slug); if (e.key === "Escape") setAddEmailForEvent(null); }}
                        autoFocus
                        data-testid={`input-add-email-${evt.slug}`}
                        className={addEmailError ? "border-destructive" : ""}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAddEmail(evt.slug)}
                        disabled={addRuleMutation.isPending}
                        data-testid={`button-confirm-email-${evt.slug}`}
                      >
                        {addRuleMutation.isPending ? "Adding…" : "Add"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAddEmailForEvent(null); setAddEmailValue(""); setAddEmailError(""); }}
                        data-testid={`button-cancel-email-${evt.slug}`}
                      >
                        Cancel
                      </Button>
                    </div>
                    {addEmailError && (
                      <p className="text-xs text-destructive">{addEmailError}</p>
                    )}
                  </div>
                )}

                {/* Email list */}
                {eventRules.length === 0 && !isAdding ? (
                  <p className="text-xs text-muted-foreground italic py-1">
                    No email addresses configured — no notifications will be sent.
                  </p>
                ) : eventRules.length > 0 ? (
                  <div className="space-y-1">
                    {eventRules.map((rule: any) => (
                      <div
                        key={rule.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-md border bg-card"
                        data-testid={`row-email-rule-${rule.id}`}
                      >
                        <span className={`flex-1 text-sm font-medium truncate ${!rule.enabled ? "text-muted-foreground line-through" : ""}`}>
                          {rule.recipient_value}
                        </span>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={enabled => toggleRuleMutation.mutate({ id: rule.id, enabled })}
                          data-testid={`switch-rule-${rule.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteRuleMutation.mutate(rule.id)}
                          data-testid={`button-delete-rule-${rule.id}`}
                          title="Remove this address"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Legacy role/user rules — shown for transparency */}
                {recipientRules.filter((r: any) => r.event_slug === evt.slug && r.recipient_type !== "email").map((rule: any) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border border-dashed bg-muted/30"
                    data-testid={`row-legacy-rule-${rule.id}`}
                  >
                    <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{rule.recipient_type}</Badge>
                    <span className="flex-1 text-sm text-muted-foreground truncate">{rule.recipient_value}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      data-testid={`button-delete-legacy-rule-${rule.id}`}
                      title="Remove legacy rule"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
