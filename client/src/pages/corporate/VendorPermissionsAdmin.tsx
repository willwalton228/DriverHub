import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ShieldCheck, Pencil, Trash2, Search, RefreshCw, AlertCircle,
  Users, Building2, Lock, FileText, DollarSign, FileBox, StickyNote,
  ShieldAlert, RotateCcw, CheckCircle2, Eye, Plus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VendorOverrideRow {
  id: string;
  userId: string;
  moduleName: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageContracts: boolean;
  canManagePricing: boolean;
  canManageDocuments: boolean;
  canManageNotes: boolean;
  canManageCompliance: boolean;
  canManageRenewals: boolean;
  updatedAt: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

type PermForm = {
  canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  canManageContracts: boolean; canManagePricing: boolean; canManageDocuments: boolean;
  canManageNotes: boolean; canManageCompliance: boolean; canManageRenewals: boolean;
};

const DEFAULT_FORM: PermForm = {
  canView: false, canCreate: false, canEdit: false, canDelete: false,
  canManageContracts: false, canManagePricing: false, canManageDocuments: false,
  canManageNotes: false, canManageCompliance: false, canManageRenewals: false,
};

// ── Permission definitions ─────────────────────────────────────────────────────

const PERM_DEFS: Array<{
  key: keyof PermForm;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: string;
}> = [
  {
    key: "canView",
    label: "View Vendors",
    description: "Access the vendor list and individual vendor detail pages.",
    icon: <Eye className="h-4 w-4 text-blue-500" />,
    group: "Core",
  },
  {
    key: "canCreate",
    label: "Create Vendors",
    description: "Add new vendor records to the system.",
    icon: <Plus className="h-4 w-4 text-green-500" />,
    group: "Core",
  },
  {
    key: "canEdit",
    label: "Edit Vendors",
    description: "Modify vendor profile information and settings.",
    icon: <Pencil className="h-4 w-4 text-orange-500" />,
    group: "Core",
  },
  {
    key: "canDelete",
    label: "Archive Vendors",
    description: "Deactivate or archive vendor records.",
    icon: <Trash2 className="h-4 w-4 text-destructive" />,
    group: "Core",
  },
  {
    key: "canManageContracts",
    label: "Manage Contracts",
    description: "View, create, and edit vendor contracts and agreements.",
    icon: <FileText className="h-4 w-4 text-purple-500" />,
    group: "Modules",
  },
  {
    key: "canManagePricing",
    label: "Manage Pricing",
    description: "View and edit vendor pricing and rate cards.",
    icon: <DollarSign className="h-4 w-4 text-green-600" />,
    group: "Modules",
  },
  {
    key: "canManageDocuments",
    label: "Manage Documents",
    description: "Upload, archive, and delete vendor documents.",
    icon: <FileBox className="h-4 w-4 text-blue-600" />,
    group: "Modules",
  },
  {
    key: "canManageNotes",
    label: "Manage Notes",
    description: "Add, edit, pin, and delete vendor notes and experience logs.",
    icon: <StickyNote className="h-4 w-4 text-yellow-600" />,
    group: "Modules",
  },
  {
    key: "canManageCompliance",
    label: "Manage Compliance",
    description: "Handle compliance records, COI tracking, and certifications.",
    icon: <ShieldAlert className="h-4 w-4 text-red-500" />,
    group: "Modules",
  },
  {
    key: "canManageRenewals",
    label: "Manage Renewals",
    description: "Manage renewal alerts, auto-renewal decisions, and alert thresholds.",
    icon: <RotateCcw className="h-4 w-4 text-teal-500" />,
    group: "Modules",
  },
];

// ── Role tier helpers ──────────────────────────────────────────────────────────

function getVendorTier(role: string | null | undefined): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  const r = role ?? "";
  if (["super_user", "super_admin", "admin", "Admin"].includes(r))
    return { label: "Admin", variant: "default" };
  if (["finance", "Finance"].includes(r))
    return { label: "Finance", variant: "secondary" };
  if (["ops", "operations", "ops_manager"].includes(r))
    return { label: "Ops", variant: "outline" };
  return { label: "Read Only", variant: "outline" };
}

function countGranted(perms: VendorOverrideRow): number {
  return [
    perms.canView, perms.canCreate, perms.canEdit, perms.canDelete,
    perms.canManageContracts, perms.canManagePricing, perms.canManageDocuments,
    perms.canManageNotes, perms.canManageCompliance, perms.canManageRenewals,
  ].filter(Boolean).length;
}

function formatUserName(row: Pick<AdminUser, "firstName" | "lastName" | "email">): string {
  if (row.firstName || row.lastName)
    return [row.firstName, row.lastName].filter(Boolean).join(" ");
  return row.email ?? "Unknown";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VendorPermissionsAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin } = usePermissions();

  const [search, setSearch] = useState("");
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PermForm>(DEFAULT_FORM);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: overrides = [],
    isLoading: overridesLoading,
    refetch: refetchOverrides,
  } = useQuery<VendorOverrideRow[]>({
    queryKey: ["/api/admin/module-permissions/vendors"],
    queryFn: () =>
      fetch("/api/admin/module-permissions/vendors", { credentials: "include" }).then((r) => r.json()),
  });

  const {
    data: allUsers = [],
    isLoading: usersLoading,
  } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () =>
      fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async ({ userId, perms }: { userId: string; perms: PermForm }) => {
      await apiRequest("PUT", `/api/admin/users/${userId}/module-permissions/vendors`, perms);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-permissions/vendors"] });
      setEditUserId(null);
      toast({ title: "Vendor permissions saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save permissions", description: err.message, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}/module-permissions/vendors`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/module-permissions/vendors"] });
      setConfirmClearId(null);
      toast({ title: "Vendor permission overrides cleared" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to clear overrides", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const overridesByUserId = useMemo(
    () => Object.fromEntries(overrides.map((o) => [o.userId, o])),
    [overrides],
  );

  const tableUsers = useMemo(() => {
    const q = search.toLowerCase();
    return allUsers.filter((u) => {
      if (!q) return true;
      const name = formatUserName(u).toLowerCase();
      return name.includes(q) || (u.email ?? "").toLowerCase().includes(q) || (u.role ?? "").toLowerCase().includes(q);
    });
  }, [allUsers, search]);

  const stats = useMemo(() => {
    const tiers = { Admin: 0, Finance: 0, Ops: 0, "Read Only": 0 };
    allUsers.forEach((u) => { tiers[getVendorTier(u.role).label]++; });
    return { total: allUsers.length, overrideCount: overrides.length, tiers };
  }, [allUsers, overrides]);

  // ── Edit helpers ───────────────────────────────────────────────────────────

  function openEdit(userId: string) {
    const existing = overridesByUserId[userId];
    setEditForm(
      existing
        ? {
            canView: existing.canView,
            canCreate: existing.canCreate,
            canEdit: existing.canEdit,
            canDelete: existing.canDelete,
            canManageContracts: existing.canManageContracts,
            canManagePricing: existing.canManagePricing,
            canManageDocuments: existing.canManageDocuments,
            canManageNotes: existing.canManageNotes,
            canManageCompliance: existing.canManageCompliance,
            canManageRenewals: existing.canManageRenewals,
          }
        : { ...DEFAULT_FORM },
    );
    setEditUserId(userId);
  }

  const editUser = allUsers.find((u) => u.id === editUserId);
  const confirmClearUser = allUsers.find((u) => u.id === confirmClearId);

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Super Admin access required to manage vendor permissions.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLoading = overridesLoading || usersLoading;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Vendor Access Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage per-user vendor permission overrides. Overrides are additive — they grant capabilities
            beyond a user's system role.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchOverrides()} data-testid="button-refresh-vendor-perms">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Total Users</span>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-medium">With Overrides</span>
            </div>
            <div className="text-2xl font-bold text-primary">{stats.overrideCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Role-Based Tiers</div>
            <div className="flex flex-col gap-1">
              {Object.entries(stats.tiers).map(([tier, count]) => (
                <div key={tier} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{tier}</span>
                  <span className="text-xs font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Perm Coverage</div>
            <div className="text-2xl font-bold">
              {stats.total > 0 ? Math.round((stats.overrideCount / stats.total) * 100) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">of users have overrides</div>
          </CardContent>
        </Card>
      </div>

      {/* User Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">All Users</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Click the edit button to assign or modify vendor permission overrides for any user.
              </CardDescription>
            </div>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-search-users"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>System Role</TableHead>
                  <TableHead>Vendor Tier</TableHead>
                  <TableHead>Permission Overrides</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  tableUsers.map((u) => {
                    const override = overridesByUserId[u.id];
                    const tier = getVendorTier(u.role);
                    const grantedCount = override ? countGranted(override) : 0;
                    const isAdmin = ["super_user", "super_admin", "admin", "Admin"].includes(u.role ?? "");
                    return (
                      <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">{formatUserName(u)}</span>
                            {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground capitalize">{u.role ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tier.variant} className="text-xs no-default-active-elevate">
                            {isAdmin ? (
                              <><ShieldCheck className="h-2.5 w-2.5 mr-1" />{tier.label}</>
                            ) : tier.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <span className="text-xs text-muted-foreground italic">Full access via role</span>
                          ) : override && grantedCount > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {PERM_DEFS.filter((d) => override[d.key]).map((d) => (
                                <Tooltip key={d.key}>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[10px] no-default-active-elevate gap-0.5">
                                      {d.icon}
                                      {d.label}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>{d.description}</TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No overrides</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isAdmin && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEdit(u.id)}
                                      data-testid={`button-edit-vendor-perms-${u.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit vendor overrides</TooltipContent>
                                </Tooltip>
                                {override && grantedCount > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setConfirmClearId(u.id)}
                                        data-testid={`button-clear-vendor-perms-${u.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Clear all overrides</TooltipContent>
                                  </Tooltip>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Users With Overrides — Quick Reference */}
      {overrides.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Active Override Summary
              <Badge variant="secondary" className="text-xs">{overrides.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {overrides.map((o) => {
                const granted = PERM_DEFS.filter((d) => o[d.key]);
                return (
                  <div
                    key={o.userId}
                    className="rounded-md border p-3 space-y-2"
                    data-testid={`card-override-${o.userId}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {[o.userFirstName, o.userLastName].filter(Boolean).join(" ") || o.userEmail || "Unknown"}
                        </p>
                        {o.userEmail && (o.userFirstName || o.userLastName) && (
                          <p className="text-xs text-muted-foreground truncate">{o.userEmail}</p>
                        )}
                      </div>
                      <Badge variant={getVendorTier(o.userRole).variant} className="text-[10px] shrink-0 no-default-active-elevate">
                        {getVendorTier(o.userRole).label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {granted.length === 0 ? (
                        <span className="text-xs text-muted-foreground">All permissions off</span>
                      ) : (
                        granted.map((d) => (
                          <Badge key={d.key} variant="outline" className="text-[10px] no-default-active-elevate gap-0.5">
                            {d.icon}
                            <span>{d.label}</span>
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {granted.length}/{PERM_DEFS.length} permissions
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(o.userId)}
                          data-testid={`button-edit-override-${o.userId}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmClearId(o.userId)}
                          data-testid={`button-clear-override-${o.userId}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editUserId} onOpenChange={(open) => { if (!open) setEditUserId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Vendor Permission Overrides
            </DialogTitle>
            {editUser && (
              <DialogDescription>
                Configuring overrides for{" "}
                <span className="font-medium text-foreground">
                  {formatUserName(editUser)}
                </span>
                {editUser.email && ` (${editUser.email})`}.
                Overrides grant capabilities beyond the user's system role.
              </DialogDescription>
            )}
          </DialogHeader>

          {editUser && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Role-based tier:</span>
              <Badge variant={getVendorTier(editUser.role).variant} className="text-xs no-default-active-elevate">
                {getVendorTier(editUser.role).label}
              </Badge>
            </div>
          )}

          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
            {["Core", "Modules"].map((group) => (
              <div key={group} className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2 pb-1">{group}</p>
                {PERM_DEFS.filter((d) => d.group === group).map((def) => (
                  <div
                    key={def.key}
                    className={`flex items-start justify-between gap-3 rounded-md p-2.5 ${editForm[def.key] ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 shrink-0">{def.icon}</span>
                      <div className="min-w-0">
                        <Label className="text-sm font-medium cursor-pointer leading-tight">{def.label}</Label>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{def.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={editForm[def.key]}
                      onCheckedChange={(val) => setEditForm((f) => ({ ...f, [def.key]: val }))}
                      data-testid={`switch-${def.key}`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditUserId(null)} data-testid="button-cancel-vendor-perms">Cancel</Button>
            <Button
              onClick={() => editUserId && saveMutation.mutate({ userId: editUserId, perms: editForm })}
              disabled={saveMutation.isPending}
              data-testid="button-save-vendor-perms"
            >
              {saveMutation.isPending ? "Saving…" : "Save Overrides"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Clear Dialog */}
      <Dialog open={!!confirmClearId} onOpenChange={(open) => { if (!open) setConfirmClearId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear All Overrides</DialogTitle>
            <DialogDescription>
              This will remove all vendor permission overrides for{" "}
              <span className="font-medium text-foreground">
                {confirmClearUser ? formatUserName(confirmClearUser) : "this user"}
              </span>
              . Their access will revert to their system role's defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmClearId(null)} data-testid="button-cancel-clear-perms">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmClearId && clearMutation.mutate(confirmClearId)}
              disabled={clearMutation.isPending}
              data-testid="button-confirm-clear-perms"
            >
              {clearMutation.isPending ? "Clearing…" : "Clear Overrides"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
